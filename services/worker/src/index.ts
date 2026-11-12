import { startScoringWorker } from './worker.js';

const mongoUri = process.env['MONGODB_URI'];
const queueRedisUrl = process.env['QUEUE_REDIS_URL'];
const databaseName = process.env['MONGODB_DATABASE'] ?? 'carelens';
if (!mongoUri || !queueRedisUrl) throw new Error('MONGODB_URI and QUEUE_REDIS_URL are required for the scoring worker');
const runtime = await startScoringWorker({ mongoUri, databaseName, queueRedisUrl, ...(process.env['ML_SERVICE_URL'] ? { mlServiceUrl: process.env['ML_SERVICE_URL'] } : {}) });
process.stdout.write('CareLens scoring worker is ready\n');
const shutdown = (): void => { void runtime.close().then(() => process.exit(0)); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
