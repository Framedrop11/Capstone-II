import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import { recordRateLimitOutcome } from './metrics.js';

const incrementScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export interface RateLimitOptions {
  maximum: number;
  windowMilliseconds: number;
}

export function createRedisRateLimiter(redis: Redis, options: RateLimitOptions = { maximum: 120, windowMilliseconds: 60_000 }): RequestHandler {
  if (!Number.isInteger(options.maximum) || options.maximum < 1) throw new Error('Rate limit maximum must be positive');
  if (!Number.isInteger(options.windowMilliseconds) || options.windowMilliseconds < 1000) throw new Error('Rate limit window must be at least one second');
  return async (request, response, next) => {
    try {
      const address = request.ip || request.socket.remoteAddress || 'unknown';
      const addressHash = createHash('sha256').update(address).digest('hex');
      const window = Math.floor(Date.now() / options.windowMilliseconds);
      const count = Number(await redis.eval(incrementScript, 1, `rate-limit:${addressHash}:${window}`, options.windowMilliseconds));
      response.setHeader('RateLimit-Limit', options.maximum);
      response.setHeader('RateLimit-Remaining', Math.max(0, options.maximum - count));
      if (count > options.maximum) {
        recordRateLimitOutcome('blocked');
        response.status(429).json({ error: 'Rate limit exceeded', requestId: request.correlationId ?? 'unknown' });
        return;
      }
      recordRateLimitOutcome('allowed');
      next();
    } catch {
      // Rate limiting is best-effort during cache Redis failure; the request can still use the API.
      recordRateLimitOutcome('fail_open');
      next();
    }
  };
}
