import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import test from 'node:test';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer } from 'testcontainers';
import { Redis } from 'ioredis';
import { ReportReadCache } from '../../services/core-api/src/cache/report-cache.js';
import { createRedisRateLimiter } from '../../services/core-api/src/http/rate-limit.js';
import { ScopedReportTokenService } from '../../services/core-api/src/auth/scoped-report-tokens.js';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { AuditLog, Consent, Prediction } from '../../services/core-api/src/data/models.js';
import type { CoreApiDependencies } from '../../services/core-api/src/http/api-types.js';
import { registerDoctorRoutes } from '../../services/core-api/src/http/routes/doctor.js';

test('report cache single-flights reads, invalidates on write and fails open on Redis outage', { timeout: 120_000 }, async () => {
  const redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const client = new Redis(`redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`, { maxRetriesPerRequest: 1, retryStrategy: () => null });
  try {
    const cache = new ReportReadCache(client, { ttlSeconds: 30, jitterSeconds: 0 });
    let reads = 0;
    let release!: (value: { basicScore: number }) => void;
    const blocked = new Promise<{ basicScore: number }>((resolve) => { release = resolve; });
    const first = cache.getOrLoad('patient-a', 'prediction-a', async () => { reads += 1; return blocked; });
    const second = cache.getOrLoad('patient-a', 'prediction-a', async () => { reads += 1; return { basicScore: 0.8 }; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    release({ basicScore: 0.4 });
    assert.deepEqual(await Promise.all([first, second]), [{ basicScore: 0.4 }, { basicScore: 0.4 }]);
    assert.equal(reads, 1);
    assert.deepEqual(await cache.getOrLoad('patient-a', 'prediction-a', async () => ({ basicScore: 1 })), { basicScore: 0.4 });
    await cache.invalidate('patient-a', 'prediction-a');
    assert.deepEqual(await cache.getOrLoad('patient-a', 'prediction-a', async () => ({ basicScore: 0.7 })), { basicScore: 0.7 });
    let completeStale!: (value: { basicScore: number }) => void;
    const inFlightStale = new Promise<{ basicScore: number }>((resolve) => { completeStale = resolve; });
    const staleRead = cache.getOrLoad('patient-a', 'prediction-a', async () => inFlightStale);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await cache.invalidate('patient-a', 'prediction-a');
    completeStale({ basicScore: 0.1 });
    await staleRead;
    assert.deepEqual(await cache.getOrLoad('patient-a', 'prediction-a', async () => ({ basicScore: 0.9 })), { basicScore: 0.9 });
    const generation0 = await cache.generation('model-versions');
    const config0 = `carelens:model-versions:v1:g${generation0}:first`;
    assert.deepEqual(await cache.getOrLoadKey(config0, async () => ({ stableVersion: 'v1' }), 15), { stableVersion: 'v1' });
    await cache.bumpGeneration('model-versions');
    const generation1 = await cache.generation('model-versions');
    assert.ok(generation1 > generation0);
    assert.deepEqual(await cache.getOrLoadKey(`carelens:model-versions:v1:g${generation1}:first`, async () => ({ stableVersion: 'v2' }), 15), { stableVersion: 'v2' });

    const rateLimitApp = express();
    rateLimitApp.use(createRedisRateLimiter(client, { maximum: 1, windowMilliseconds: 60_000 }));
    rateLimitApp.get('/', (_request, response) => response.status(200).end());
    assert.equal((await request(rateLimitApp).get('/')).status, 200);
    assert.equal((await request(rateLimitApp).get('/')).status, 429);
    await client.quit();
    assert.equal((await request(rateLimitApp).get('/')).status, 200);
    assert.deepEqual(await cache.getOrLoad('patient-b', 'prediction-b', async () => ({ basicScore: 0.2 })), { basicScore: 0.2 });
  } finally {
    if (client.status !== 'end') await client.quit();
    await redisContainer.stop();
  }
});

test('doctor report checks current consent before reading cached report data', { timeout: 120_000 }, async () => {
  const mongo = await new MongoDBContainer('mongo:7.0').withUsername('root').withPassword('root-password').start();
  const redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  const redis = new Redis(`redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`, { maxRetriesPerRequest: 1, retryStrategy: () => null });
  const mongoUrl = new URL(mongo.getConnectionString());
  mongoUrl.searchParams.set('directConnection', 'true');
  try {
    await mongoose.connect(mongoUrl.toString(), { dbName: `carelens_cache_${Date.now()}`, autoIndex: false });
    const patientId = new Types.ObjectId();
    const doctorId = new Types.ObjectId();
    const prediction = await Prediction.create({ patientId, questionnaireId: new Types.ObjectId(), basicScore: 0.3, mlScore: 0.45, scoreSource: 'ml_refined', modelVersion: 'test-v1', factors: ['age'] });
    const consent = await Consent.create({ patientId, doctorId, predictionId: prediction._id, scope: 'full_report', expiresAt: new Date(Date.now() + 60_000), revoked: false });
    const secret = new TextEncoder().encode('report-cache-test-secret-at-least-32-bytes');
    const accessTokens = new AccessTokenService({ secret, issuer: 'https://carelens.test', audience: 'carelens-api' });
    const scopedReportTokens = new ScopedReportTokenService(secret, 'https://carelens.test', 'carelens-api');
    const token = await scopedReportTokens.issue(doctorId.toString(), patientId.toString(), prediction._id.toString());
    const app = express();
    app.use(express.json());
    registerDoctorRoutes(app, {
      environment: 'test', oidcRedirectUri: 'http://localhost', authService: {}, accessTokens, scopedReportTokens,
      scoringQueue: {}, queueRedis: redis, rateLimitRedis: redis, reportCache: new ReportReadCache(redis),
    } as unknown as CoreApiDependencies);
    app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
      void _next;
      const status = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
      response.status(status).json({ error: error instanceof Error ? error.message : 'error' });
    });
    const reportUrl = `/api/v1/doctor/reports/${prediction._id.toString()}`;
    const first = await request(app).get(reportUrl).set('Authorization', `Bearer ${token}`);
    assert.equal(first.status, 200);
    assert.equal(first.body.mlScore, 0.45);
    await Consent.updateOne({ _id: consent._id }, { $set: { revoked: true, revokedAt: new Date() } });
    const afterRevocation = await request(app).get(reportUrl).set('Authorization', `Bearer ${token}`);
    assert.equal(afterRevocation.status, 409);
    assert.equal(await AuditLog.countDocuments({ patientId, action: 'view_report' }), 1);
  } finally {
    await mongoose.disconnect();
    await redis.quit();
    await Promise.all([redisContainer.stop(), mongo.stop()]);
  }
});
