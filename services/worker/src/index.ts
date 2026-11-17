import { startScoringWorker } from './worker.js';
import { startWorkerMetricsServer } from './observability.js';
import { writeLog } from '../../../packages/shared/src/index.js';

const mongoUri = process.env['MONGODB_URI'];
const queueRedisUrl = process.env['QUEUE_REDIS_URL'];
const cacheRedisUrl = process.env['CACHE_REDIS_URL'];
const databaseName = process.env['MONGODB_DATABASE'] ?? 'carelens';
if (!mongoUri || !queueRedisUrl || !cacheRedisUrl) throw new Error('MONGODB_URI, QUEUE_REDIS_URL, and CACHE_REDIS_URL are required for the scoring worker');
const runtime = await startScoringWorker({ mongoUri, databaseName, queueRedisUrl, cacheRedisUrl, ...(process.env['ML_SERVICE_URL'] ? { mlServiceUrl: process.env['ML_SERVICE_URL'] } : {}) });
const metricsServer = await startWorkerMetricsServer(Number(process.env['METRICS_PORT'] ?? 9464));
writeLog('info', 'worker_ready', { service: 'carelens-worker', metricsPort: Number(process.env['METRICS_PORT'] ?? 9464) });
const shutdown = (): void => {
  void runtime.close().then(() => new Promise<void>((resolve, reject) => metricsServer.close((error) => error ? reject(error) : resolve())))
    .then(() => process.exit(0));
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
