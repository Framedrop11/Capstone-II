import express, { type ErrorRequestHandler, type Express } from 'express';
import OpenApiValidator from 'express-openapi-validator';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { writeLog } from '../../../../packages/shared/src/index.js';
import type { CoreApiDependencies } from './api-types.js';
import { ReportReadCache } from '../cache/report-cache.js';
import { correlationIdMiddleware } from './correlation.js';
import { HttpError } from './errors.js';
import { createRedisRateLimiter } from './rate-limit.js';
import { httpMetricsMiddleware, metricsContentType, renderMetrics, setDependencyReady } from './metrics.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerPatientRoutes } from './routes/patient.js';
import { registerDoctorRoutes } from './routes/doctor.js';
import { registerAdminRoutes } from './routes/admin.js';

export async function createCoreApi(dependencies: CoreApiDependencies): Promise<Express> {
  dependencies.reportCache ??= new ReportReadCache(dependencies.rateLimitRedis);
  const app = express();
  const specText = await readFile(resolve(process.cwd(), 'services/core-api/openapi/openapi.yaml'), 'utf8');
  const spec = parse(specText) as Record<string, unknown>;
  app.disable('x-powered-by');
  app.use(correlationIdMiddleware);
  app.use(httpMetricsMiddleware);
  app.use(express.json({ limit: dependencies.maximumRequestBytes ?? '1mb' }));
  if (['local', 'dev', 'staging'].includes(dependencies.environment)) {
    const swaggerHandler = swaggerUi.setup(spec, {
      customSiteTitle: 'CareLens API documentation',
      swaggerOptions: {
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        persistAuthorization: false,
        tryItOutEnabled: true,
      },
    });
    for (const path of ['/docs', '/api/docs']) {
      app.use(path, swaggerUi.serve, swaggerHandler);
    }
  }
  app.get('/healthz', (_request, response) => response.status(200).json({ status: 'ok' }));
  app.get('/readyz', async (_request, response) => {
    const [queueReady, cacheReady] = await Promise.all([
      dependencies.scoringQueue.isReady(),
      dependencies.rateLimitRedis.ping().then(() => true, () => false),
    ]);
    const databaseReady = mongoose.connection.readyState === 1;
    const ready = queueReady && databaseReady;
    setDependencyReady('mongo', databaseReady);
    setDependencyReady('queue_redis', queueReady);
    setDependencyReady('cache_redis', cacheReady);
    response.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: databaseReady, queue: queueReady, cache: cacheReady, degraded: ready && !cacheReady });
  });
  app.get('/metrics', async (_request, response, next) => {
    try { response.type(metricsContentType).send(await renderMetrics()); } catch (error) { next(error); }
  });
  app.use(createRedisRateLimiter(dependencies.rateLimitRedis));
  app.use('/api/v1/patient', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use('/api/v1/doctor', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use('/api/v1/admin', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.use(OpenApiValidator.middleware({ apiSpec: spec as never, validateRequests: true, validateResponses: true, validateSecurity: false }));
  registerAuthRoutes(app, dependencies);
  registerPatientRoutes(app, dependencies);
  registerDoctorRoutes(app, dependencies);
  registerAdminRoutes(app, dependencies);
  app.use(((error: unknown, request, response, next) => {
    void next;
    const candidate = error as { status?: number; statusCode?: number; message?: string; errors?: unknown[] };
    const status = error instanceof HttpError ? error.statusCode : candidate.status ?? candidate.statusCode ?? 500;
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    const message = safeStatus === 500 ? 'Internal server error' : error instanceof HttpError ? error.message : candidate.message ?? 'Request is invalid';
    if (safeStatus >= 500) {
      writeLog('error', 'http_error', { service: 'carelens-core-api', correlationId: request.correlationId, statusCode: safeStatus, errorType: error instanceof Error ? error.name : 'UnknownError' });
    }
    response.status(safeStatus).json({ error: message, requestId: request.correlationId ?? 'unknown', ...(candidate.errors && safeStatus < 500 ? { details: candidate.errors } : {}) });
  }) as ErrorRequestHandler);
  return app;
}
