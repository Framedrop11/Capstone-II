import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { createAuthComponents } from './auth/runtime.js';
import { createCoreApi } from './http/app.js';
import { BullMqScoringQueue } from './queue/scoring-queue.js';
import { writeLog } from '../../../packages/shared/src/index.js';
import { createEmailNotificationAdapter } from './notifications/email-adapter.js';

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
const emailNotifications = process.env['EMAIL_HOST']
  ? createEmailNotificationAdapter({
      host: process.env['EMAIL_HOST'],
      port: Number(process.env['EMAIL_PORT'] ?? 1025),
      from: process.env['EMAIL_FROM'] ?? 'CareLens <no-reply@carelens.local>',
    })
  : undefined;
const app = await createCoreApi({
  environment: config.environment,
  oidcRedirectUri: config.redirectUri,
  authService,
  accessTokens,
  scopedReportTokens,
  scoringQueue,
  queueRedis,
  rateLimitRedis,
  ...(process.env['ML_SERVICE_URL'] ? { mlServiceUrl: process.env['ML_SERVICE_URL'] } : {}),
  ...(emailNotifications ? { emailNotifications } : {}),
});
const server = app.listen(Number(process.env['PORT'] ?? 3000), () => writeLog('info', 'core_api_ready', { service: 'carelens-core-api', port: Number(process.env['PORT'] ?? 3000) }));

async function shutdown(): Promise<void> {
  server.close();
  await scoringQueue.close();
  emailNotifications?.close();
  await Promise.all([queueRedis.quit(), rateLimitRedis.quit(), mongoose.disconnect()]);
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
