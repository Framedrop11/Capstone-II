import assert from 'node:assert/strict';
import request from 'supertest';
import test from 'node:test';
import { createCoreApi } from '../../services/core-api/src/http/app.js';
import type { CoreApiDependencies } from '../../services/core-api/src/http/api-types.js';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { ScopedReportTokenService } from '../../services/core-api/src/auth/scoped-report-tokens.js';

test('Core API loads and applies the OpenAPI validator to operational and versioned routes', async () => {
  const redis = { ping: async () => 'PONG', eval: async () => 1 };
  const secret = new TextEncoder().encode('core-api-contract-test-secret-minimum-32-bytes');
  const app = await createCoreApi({
    environment: 'test', oidcRedirectUri: 'http://localhost:3000/api/v1/auth/callback',
    authService: {}, accessTokens: new AccessTokenService({ secret, issuer: 'https://carelens.test', audience: 'carelens-api' }), scopedReportTokens: new ScopedReportTokenService(secret, 'https://carelens.test', 'carelens-api'), scoringQueue: { isReady: async () => true, enqueue: async () => {}, close: async () => {} },
    queueRedis: redis, rateLimitRedis: redis,
  } as unknown as CoreApiDependencies);
  const health = await request(app).get('/healthz');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.ok(health.headers['x-correlation-id']);
  const metrics = await request(app).get('/metrics');
  assert.equal(metrics.status, 200);
  assert.match(metrics.text, /carelens_http_requests_total/);
  assert.match(metrics.text, /carelens_cache_operations_total/);
  const unauthenticated = await request(app).get('/api/v1/patient/predictions');
  assert.equal(unauthenticated.status, 401, JSON.stringify(unauthenticated.body));
  const invalid = await request(app).post('/api/v1/patient/questionnaires').send({ responses: [] });
  assert.equal(invalid.status, 400);
});
