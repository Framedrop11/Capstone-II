import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import { AuditLog, Notification, Patient, Prediction, Questionnaire, User } from '../../services/core-api/src/data/models.js';
import { startScoringWorker, scoringQueueName, deadLetterQueueName, processScoringJob } from '../../services/worker/src/worker.js';
import { MlClient } from '../../services/worker/src/ml/client.js';

test('real Redis queue and MongoDB worker persist a FINDRISC fallback idempotently and dead-letter invalid input', { timeout: 150_000 }, async () => {
  const mongo = await new MongoDBContainer('mongo:7.0').withUsername('root').withPassword('root-password').start();
  const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const dbName = `carelens_worker_${Date.now()}`;
  const mongoUrl = new URL(mongo.getConnectionString());
  mongoUrl.searchParams.set('directConnection', 'true');
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  let runtime: Awaited<ReturnType<typeof startScoringWorker>> | undefined;
  const producerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  let queue: Queue | undefined;
  let deadLetters: Queue | undefined;
  try {
    await mongoose.connect(mongoUrl.toString(), { dbName, autoIndex: false });
    await Promise.all([Prediction.createCollection(), Notification.createCollection()]);
    await Prediction.collection.createIndex({ questionnaireId: 1 }, { unique: true });
    await Notification.collection.createIndex({ recipientId: 1, kind: 1, 'payload.questionnaireId': 1 }, { unique: true, partialFilterExpression: { 'payload.questionnaireId': { $type: 'string' } } });
    await AuditLog.collection.createIndex({ 'details.questionnaireId': 1, action: 1 }, { unique: true, partialFilterExpression: { action: 'score_generated', 'details.questionnaireId': { $type: 'string' } } });
    const user = await User.create({ name: 'Test Patient', email: `worker-${Date.now()}@example.test`, authProvider: `worker-${Date.now()}`, role: 'patient' });
    const patient = await Patient.create({ userId: user._id });
    const responses = {
      ageYears: 40, bmi: 24, waistCm: 78, sex: 'female', activity30MinDaily: true,
      fruitVegetablesDaily: true, antihypertensiveTreatment: false, historyHighGlucose: false,
      familyHistoryDiabetes: 'none',
    };
    const questionnaire = await Questionnaire.create({ patientId: patient._id, responses });
    const invalid = await Questionnaire.create({ patientId: patient._id, responses: { ageYears: 20 } });
    await mongoose.disconnect();

    runtime = await startScoringWorker({ mongoUri: mongoUrl.toString(), databaseName: dbName, queueRedisUrl: redisUrl });
    queue = new Queue(scoringQueueName, { connection: producerConnection });
    deadLetters = new Queue(deadLetterQueueName, { connection: producerConnection });
    assert.ok(await queue.getJobScheduler('nightly-rescore'));
    await queue.add('score-questionnaire', { questionnaireId: questionnaire._id.toString(), patientId: patient._id.toString(), correlationId: 'worker-test-1' }, { jobId: questionnaire._id.toString(), attempts: 3, backoff: { type: 'exponential', delay: 100 } });
    await queue.add('score-questionnaire', { questionnaireId: invalid._id.toString(), patientId: patient._id.toString(), correlationId: 'worker-test-2' }, { jobId: invalid._id.toString(), attempts: 3, backoff: { type: 'exponential', delay: 100 } });

    const deadline = Date.now() + 20_000;
    let prediction = null;
    let deadLetterCount = 0;
    while (Date.now() < deadline && (!prediction || deadLetterCount === 0)) {
      prediction = await Prediction.findOne({ questionnaireId: questionnaire._id }).exec();
      deadLetterCount = await deadLetters.count();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(prediction);
    assert.equal(prediction.scoreSource, 'basic_only');
    assert.equal(prediction.modelVersion, 'findrisc-lindstrom-2003-v1');
    assert.equal(prediction.basicScore, 0);
    assert.equal(deadLetterCount, 1);
    assert.equal(await Notification.countDocuments({ recipientId: user._id, kind: 'report_ready' }), 1);
    assert.equal(await AuditLog.countDocuments({ patientId: patient._id, action: 'score_generated' }), 1);
    assert.equal(await Prediction.countDocuments({ questionnaireId: questionnaire._id }), 1);
    await processScoringJob({ questionnaireId: questionnaire._id.toString(), patientId: patient._id.toString(), correlationId: 'worker-test-retry' }, new MlClient(undefined));
    assert.equal(await Prediction.countDocuments({ questionnaireId: questionnaire._id }), 1);
    assert.equal(await Notification.countDocuments({ recipientId: user._id, kind: 'report_ready' }), 1);
    assert.equal(await AuditLog.countDocuments({ patientId: patient._id, action: 'score_generated' }), 1);
  } finally {
    await runtime?.close();
    await Promise.all([queue?.close(), deadLetters?.close(), producerConnection.quit(), mongoose.disconnect()]);
    await Promise.all([redis.stop(), mongo.stop()]);
  }
});

test('BullMQ recovers an active job after a worker is force-closed', { timeout: 60_000 }, async () => {
  const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const url = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue('crash-recovery', { connection });
  const events = new QueueEvents('crash-recovery', { connection });
  let startedResolve!: () => void;
  const started = new Promise<void>((resolve) => { startedResolve = resolve; });
  let releaseFirst!: () => void;
  const firstWorker = new Worker('crash-recovery', async () => {
    startedResolve();
    await new Promise<void>((resolve) => { releaseFirst = resolve; });
    return 'stale-worker-finished';
  }, { connection, lockDuration: 1000, stalledInterval: 500, maxStalledCount: 2 });
  let secondWorker: Worker | undefined;
  try {
    await Promise.all([events.waitUntilReady(), firstWorker.waitUntilReady()]);
    const job = await queue.add('recover-me', { sequence: 1 }, { attempts: 2 });
    await started;
    secondWorker = new Worker('crash-recovery', async () => 'recovered', { connection, lockDuration: 1000, stalledInterval: 500, maxStalledCount: 2 });
    await secondWorker.waitUntilReady();
    await firstWorker.close(true);
    const deadline = Date.now() + 15_000;
    let state = await job.getState();
    while (Date.now() < deadline && state !== 'completed') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      state = await job.getState();
    }
    assert.equal(state, 'completed');
    const recoveredJob = await queue.getJob(job.id!);
    assert.equal(recoveredJob?.returnvalue, 'recovered');
  } finally {
    releaseFirst?.();
    await Promise.all([firstWorker.close(true), secondWorker?.close(), events.close(), queue.close(), connection.quit()]);
    await redis.stop();
  }
});
