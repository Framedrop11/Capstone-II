import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import request from 'supertest';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { AuthService } from '../../services/core-api/src/auth/auth-service.js';
import { MockOidcProvider } from '../../services/core-api/src/auth/oidc-provider.js';
import { RefreshSessionService } from '../../services/core-api/src/auth/refresh-sessions.js';
import { ScopedReportTokenService } from '../../services/core-api/src/auth/scoped-report-tokens.js';
import { AuditLog, Consent, ModelVersion, Notification, Patient, Prediction, User } from '../../services/core-api/src/data/models.js';
import { createCoreApi } from '../../services/core-api/src/http/app.js';
import type { CoreApiDependencies } from '../../services/core-api/src/http/api-types.js';
import type { ScoringJob } from '../../services/core-api/src/queue/scoring-queue.js';
import { processScoringJob } from '../../services/worker/src/worker.js';
import { MlClient } from '../../services/worker/src/ml/client.js';

test('API journey: patient scores and shares a report, doctor access is audited and revoked immediately', { timeout: 180_000 }, async () => {
  const mongo = await new MongoDBContainer('mongo:7.0').withUsername('root').withPassword('root-password').start();
  const redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const mongoUrl = new URL(mongo.getConnectionString());
  mongoUrl.searchParams.set('directConnection', 'true');
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const dbName = `carelens_e2e_${Date.now()}`;
  const secret = new TextEncoder().encode('e2e-signing-secret-minimum-32-bytes-long');
  const accessTokens = new AccessTokenService({ secret, issuer: 'https://carelens.test', audience: 'carelens-api' });
  const scopedTokens = new ScopedReportTokenService(secret, 'https://carelens.test', 'carelens-api');
  const authService = new AuthService({
    environment: 'test', provider: new MockOidcProvider({ subject: 'riya-e2e', email: 'riya.e2e@example.test', emailVerified: true, name: 'Riya' }),
    redirectUri: 'http://localhost:3000/api/v1/auth/callback',
    transactionCookieKey: new TextEncoder().encode('e2e-oidc-transaction-key-minimum-32-bytes'),
    accessTokens, refreshSessions: new RefreshSessionService(3600),
  });
  const queued: ScoringJob[] = [];
  let app;
  try {
    await mongoose.connect(mongoUrl.toString(), { dbName, autoIndex: false });
    await Promise.all([User, Patient, Consent, Prediction, AuditLog, Notification, ModelVersion].map((model) => model.createIndexes()));
    app = await createCoreApi({
      environment: 'test', oidcRedirectUri: 'http://localhost:3000/api/v1/auth/callback', authService, accessTokens, scopedReportTokens: scopedTokens,
      scoringQueue: { isReady: async () => true, enqueue: async (job: ScoringJob) => { queued.push(job); }, close: async () => {} },
      queueRedis: redis, rateLimitRedis: redis,
    } as unknown as CoreApiDependencies);

    const start = await request(app).get('/api/v1/auth/login').expect(302);
    const authorization = new URL(start.headers['location'] as string);
    const cookies = start.headers['set-cookie'];
    const transactionCookie = (Array.isArray(cookies) ? cookies[0] : cookies)!.split(';')[0]!;
    const login = await request(app).get(`/api/v1/auth/callback?code=mock-valid-code&state=${encodeURIComponent(authorization.searchParams.get('state')!)}`)
      .set('Cookie', transactionCookie).expect(200);
    const patientToken = login.body.accessToken as string;
    const patientId = login.body.userId as string;
    const submitted = await request(app).post('/api/v1/patient/questionnaires').set('Authorization', `Bearer ${patientToken}`)
      .set('Idempotency-Key', 'riya-e2e-1').send({ responses: {
        ageYears: 40, bmi: 24, waistCm: 78, sex: 'female', activity30MinDaily: true,
        fruitVegetablesDaily: true, antihypertensiveTreatment: false, historyHighGlucose: false,
        familyHistoryDiabetes: 'none',
      } }).expect(202);
    assert.ok(submitted.body.questionnaireId);
    assert.equal(queued.length, 1);
    await processScoringJob(queued[0]!, new MlClient(undefined));
    const predictions = await request(app).get('/api/v1/patient/predictions').set('Authorization', `Bearer ${patientToken}`).expect(200);
    const prediction = predictions.body.items[0];
    assert.ok(prediction.predictionId);
    assert.equal(prediction.scoreSource, 'basic_only');
    const report = await request(app).get(`/api/v1/patient/reports/${prediction.predictionId}`).set('Authorization', `Bearer ${patientToken}`).expect(200);
    assert.match(report.body.disclaimer, /screening aid, not a diagnosis/i);

    const doctor = await User.create({ name: 'Dr. Mehta', email: 'doctor.e2e@example.test', authProvider: 'e2e:doctor', role: 'doctor' });
    const doctorToken = await accessTokens.issue(doctor._id.toString(), 'doctor');
    const consent = await request(app).post('/api/v1/patient/consents').set('Authorization', `Bearer ${patientToken}`).send({
      doctorId: doctor._id.toString(), predictionId: prediction.predictionId, scope: 'basicScore,scoreSource,riskBand,modelVersion,explanation',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }).expect(201);
    assert.equal(await Notification.countDocuments({ recipientId: doctor._id, kind: 'report_shared' }), 1);
    const worklist = await request(app).get('/api/v1/doctor/shared-patients').set('Authorization', `Bearer ${doctorToken}`).expect(200);
    assert.equal(worklist.body.items[0].predictionId, prediction.predictionId);
    assert.equal(worklist.body.items[0].riskBand, 'low');
    assert.ok(worklist.body.items[0].sharedAt);
    const access = await request(app).post(`/api/v1/doctor/reports/${prediction.predictionId}/access`).set('Authorization', `Bearer ${doctorToken}`).expect(200);
    const doctorReport = await request(app).get(`/api/v1/doctor/reports/${prediction.predictionId}`).set('Authorization', `Bearer ${access.body.accessToken}`).expect(200);
    assert.equal(doctorReport.body.basicScore, prediction.basicScore);
    assert.equal(await AuditLog.countDocuments({ patientId: (await Patient.findOne({ userId: patientId }))!._id, action: 'view_report' }), 2);
    await request(app).post('/api/v1/doctor/outcomes').set('Authorization', `Bearer ${doctorToken}`).send({ predictionId: prediction.predictionId, actualOutcome: 'negative' }).expect(201);

    await request(app).post(`/api/v1/patient/consents/${consent.body.consentId}/revoke`).set('Authorization', `Bearer ${patientToken}`).expect(200);
    await request(app).get(`/api/v1/doctor/reports/${prediction.predictionId}`).set('Authorization', `Bearer ${access.body.accessToken}`).expect(409);
    const admin = await User.create({ name: 'Admin', email: 'admin.e2e@example.test', authProvider: 'e2e:admin', role: 'admin' });
    const adminToken = await accessTokens.issue(admin._id.toString(), 'admin');
    const health = await request(app).get('/api/v1/admin/system-health').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(health.body.status, 'ready');
    assert.equal(health.body.database, true);
    const users = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(users.body.items.some((row: { userId: string }) => row.userId === doctor._id.toString()));
    const roleUpdate = await request(app).patch(`/api/v1/admin/users/${doctor._id}/role`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'patient' }).expect(200);
    assert.equal(roleUpdate.body.role, 'patient');
    await ModelVersion.create([
      { version: 'findrisc-v1', status: 'stable', canaryTrafficPercent: 0, artifactUri: 'registry://models/findrisc-v1', testResults: { promotionEligible: true }, promotedAt: new Date() },
      { version: 'findrisc-v2', status: 'candidate', canaryTrafficPercent: 0, artifactUri: 'registry://models/findrisc-v2', testResults: { promotionEligible: true }, promotedAt: null },
    ]);
    const versions = await request(app).get('/api/v1/admin/model-versions').set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.equal(versions.body.items.length, 2);
    await request(app).post('/api/v1/admin/model-versions/findrisc-v2/promote').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app).post('/api/v1/admin/model-versions/findrisc-v1/rollback').set('Authorization', `Bearer ${adminToken}`).expect(200);
    const audit = await request(app).get(`/api/v1/admin/audit?patientId=${(await Patient.findOne({ userId: patientId }))!._id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    assert.ok(audit.body.items.some((row: { action: string }) => row.action === 'revoke_consent'));
  } finally {
    await mongoose.disconnect();
    await Promise.all([redis.quit(), redisContainer.stop(), mongo.stop()]);
  }
});
