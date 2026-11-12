import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { createAuthComponents } from './auth/runtime.js';
import { createCoreApi } from './http/app.js';
import { BullMqScoringQueue } from './queue/scoring-queue.js';

const { config, authService, accessTokens, scopedReportTokens } = await createAuthComponents();
const database = process.env['MONGODB_DATABASE'] ?? 'carelens';
const mongoUri = process.env['MONGODB_URI'];
const queueUrl = process.env['QUEUE_REDIS_URL'];
const cacheUrl = process.env['CACHE_REDIS_URL'];
if (!mongoUri || !queueUrl || !cacheUrl) throw new Error('MONGODB_URI, QUEUE_REDIS_URL, and CACHE_REDIS_URL are required');
await mongoose.connect(mongoUri, { dbName: database, autoIndex: false });
const queueRedis = new Redis(queueUrl, { maxRetriesPerRequest: null });
const rateLimitRedis = new Redis(cacheUrl, { maxRetriesPerRequest: 1, retryStrategy: (attempt: number) => attempt > 3 ? null : Math.min(attempt * 100, 1000) });
const scoringQueue = new BullMqScoringQueue(queueRedis);
const app = await createCoreApi({
  environment: config.environment,
  oidcRedirectUri: config.redirectUri,
  authService,
  accessTokens,
  scopedReportTokens,
  scoringQueue,
  queueRedis,
  rateLimitRedis,
});
const server = app.listen(Number(process.env['PORT'] ?? 3000), () => process.stdout.write(`CareLens Core API listening on ${process.env['PORT'] ?? 3000}\n`));

async function shutdown(): Promise<void> {
  server.close();
  await scoringQueue.close();
  await Promise.all([queueRedis.quit(), rateLimitRedis.quit(), mongoose.disconnect()]);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
