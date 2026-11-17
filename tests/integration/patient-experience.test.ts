import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose, { Types } from 'mongoose';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { ScopedReportTokenService } from '../../services/core-api/src/auth/scoped-report-tokens.js';
import { AuditLog, Consent, Notification, Patient, Prediction, Questionnaire, User } from '../../services/core-api/src/data/models.js';
import { createCoreApi } from '../../services/core-api/src/http/app.js';
import type { CoreApiDependencies } from '../../services/core-api/src/http/api-types.js';

test('patient APIs keep check-up status, doctor search, notifications, sharing and activity within the signed-in patient', { timeout: 120_000 }, async () => {
  const mongo = await new MongoDBContainer('mongo:7.0').withUsername('root').withPassword('root-password').start();
  const redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const mongoUrl = new URL(mongo.getConnectionString());
  mongoUrl.searchParams.set('directConnection', 'true');
  const redis = new Redis(`redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`, { maxRetriesPerRequest: null });
  const secret = new TextEncoder().encode('patient-experience-integration-secret-32-bytes');
  const tokens = new AccessTokenService({ secret, issuer: 'http://localhost:3000', audience: 'carelens-api' });
  try {
    await mongoose.connect(mongoUrl.toString(), { dbName: `carelens_patient_${Date.now()}`, autoIndex: false });
    await Promise.all([User.createIndexes(), Patient.createIndexes(), Questionnaire.createIndexes(), Prediction.createIndexes(), Consent.createIndexes(), Notification.createIndexes(), AuditLog.createIndexes()]);
    const patientUser = await User.create({ name: 'Riya Patient', email: 'riya@example.test', authProvider: 'patient-experience-riya', role: 'patient' });
    const patient = await Patient.create({ userId: patientUser._id });
    const doctor = await User.create({ name: 'Dr. Mehta', email: 'mehta@example.test', authProvider: 'patient-experience-mehta', role: 'doctor' });
    const questionnaire = await Questionnaire.create({ patientId: patient._id, responses: { ageYears: 35 }, idempotencyKey: 'patient-experience-key' });
    const app = await createCoreApi({
      environment: 'test', oidcRedirectUri: 'http://localhost:3000/api/v1/auth/callback', authService: {}, accessTokens: tokens,
      scopedReportTokens: new ScopedReportTokenService(secret, 'http://localhost:3000', 'carelens-api'),
      scoringQueue: { isReady: async () => true, enqueue: async () => {}, getStatus: async () => 'pending' as const, close: async () => {} },
      queueRedis: redis, rateLimitRedis: redis,
    } as unknown as CoreApiDependencies);
    const token = await tokens.issue(patientUser._id.toString(), 'patient');
    const auth = { Authorization: `Bearer ${token}` };
    const validResponses = {
      ageYears: 35,
      bmi: 24,
      waistCm: 80,
      sex: 'female',
      activity30MinDaily: true,
      fruitVegetablesDaily: true,
      antihypertensiveTreatment: false,
      historyHighGlucose: false,
      familyHistoryDiabetes: 'none',
    };
    const submitted = await request(app)
      .post('/api/v1/patient/questionnaires')
      .set({ ...auth, 'Idempotency-Key': 'patient-experience-submit' })
      .send({ responses: validResponses })
      .expect(202);
    const repeated = await request(app)
      .post('/api/v1/patient/questionnaires')
      .set({ ...auth, 'Idempotency-Key': 'patient-experience-submit' })
      .send({ responses: validResponses })
      .expect(202);
    assert.equal(submitted.body.questionnaireId, repeated.body.questionnaireId);
    await request(app)
      .post('/api/v1/patient/questionnaires')
      .set({ ...auth, 'Idempotency-Key': 'patient-experience-submit' })
      .send({ responses: { ...validResponses, ageYears: 36 } })
      .expect(409);
    const submittedStatus = await request(app)
      .get(`/api/v1/patient/questionnaires/${submitted.body.questionnaireId}`)
      .set(auth)
      .expect(200);
    assert.equal(submittedStatus.body.status, 'pending');
    const statusPending = await request(app).get(`/api/v1/patient/questionnaires/${questionnaire._id}`).set(auth).expect(200);
    assert.equal(statusPending.body.status, 'pending');
    assert.equal(statusPending.headers['cache-control'], 'no-store');
    const doctorList = await request(app).get('/api/v1/patient/doctors?query=mehta').set(auth).expect(200);
    assert.deepEqual(doctorList.body.items, [{ doctorId: doctor._id.toString(), name: 'Dr. Mehta' }]);
    const prediction = await Prediction.create({ patientId: patient._id, questionnaireId: questionnaire._id, basicScore: 0.3, mlScore: null, scoreSource: 'basic_only', riskBand: 'moderate', modelVersion: 'findrisc-v1', factors: ['age'] });
    const statusComplete = await request(app).get(`/api/v1/patient/questionnaires/${questionnaire._id}`).set(auth).expect(200);
    assert.equal(statusComplete.body.status, 'complete');
    assert.equal(statusComplete.body.predictionId, prediction._id.toString());
    await Notification.create({ recipientId: patientUser._id, patientId: patient._id, kind: 'report_ready', payload: { questionnaireId: questionnaire._id.toString(), predictionId: prediction._id.toString() } });
    const inbox = await request(app).get('/api/v1/patient/notifications').set(auth).expect(200);
    assert.equal(inbox.body.unreadCount, 1);
    assert.equal(inbox.headers['cache-control'], 'no-store');
    const notificationId = inbox.body.items[0].notificationId as string;
    await request(app).post(`/api/v1/patient/notifications/${notificationId}/read`).set(auth).expect(200);
    const shared = await request(app).post('/api/v1/patient/consents').set(auth).send({ doctorId: doctor._id.toString(), predictionId: prediction._id.toString(), scope: 'full_report', expiresAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(201);
    assert.equal(shared.body.doctorName, 'Dr. Mehta');
    const listed = await request(app).get('/api/v1/patient/consents').set(auth).expect(200);
    assert.equal(listed.body.items[0].doctorName, 'Dr. Mehta');
    await request(app).post(`/api/v1/patient/consents/${shared.body.consentId}/revoke`).set(auth).expect(200);
    const activity = await request(app).get('/api/v1/patient/audit').set(auth).expect(200);
    assert.deepEqual(activity.body.items.map((item: { action: string }) => item.action), ['revoke_consent', 'grant_consent']);
    assert.equal(activity.headers['cache-control'], 'no-store');
    const otherPatientQuestionnaire = new Types.ObjectId().toString();
    await request(app).get(`/api/v1/patient/questionnaires/${otherPatientQuestionnaire}`).set(auth).expect(404);
    assert.equal(await Patient.countDocuments(), 1);
  } finally {
    await mongoose.disconnect();
    await Promise.all([redis.quit(), redisContainer.stop(), mongo.stop()]);
  }
});
