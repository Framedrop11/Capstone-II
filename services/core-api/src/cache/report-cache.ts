import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { recordCacheOperation } from '../http/metrics.js';

export interface ReportCacheOptions {
  ttlSeconds?: number;
  jitterSeconds?: number;
}

export class ReportReadCache {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly ttlSeconds: number;
  private readonly jitterSeconds: number;

  constructor(private readonly redis: Redis, options: ReportCacheOptions = {}) {
    this.ttlSeconds = options.ttlSeconds ?? 300;
    this.jitterSeconds = options.jitterSeconds ?? 60;
    if (!Number.isInteger(this.ttlSeconds) || this.ttlSeconds < 1) throw new Error('Report cache TTL must be positive');
    if (!Number.isInteger(this.jitterSeconds) || this.jitterSeconds < 0) throw new Error('Report cache jitter must be non-negative');
  }

  async getOrLoad<T>(patientId: string, predictionId: string, loader: () => Promise<T>): Promise<T> {
    const key = this.key(patientId, predictionId);
    const epoch = this.epochKey(key);
    let observedEpoch: string | null = null;
    try { observedEpoch = await this.redis.get(epoch); } catch { /* Cache will fail open. */ }
    return this.getOrLoadKey(key, loader, this.ttlSeconds, async (value) => {
      try {
        if ((await this.redis.get(epoch)) !== observedEpoch) return;
        const jitter = this.jitterSeconds ? Math.floor(Math.random() * (this.jitterSeconds + 1)) : 0;
        await this.redis.set(key, JSON.stringify(value), 'EX', this.ttlSeconds + jitter);
        recordCacheOperation('report', 'write', 'success');
      } catch { recordCacheOperation('report', 'write', 'fail_open'); }
    }, 'report');
  }

  async getOrLoadKey<T>(key: string, loader: () => Promise<T>, ttlSeconds = this.ttlSeconds, store?: (value: T) => Promise<void>, cacheType = 'model_versions'): Promise<T> {
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) {
        recordCacheOperation(cacheType, 'read', 'hit');
        return JSON.parse(cached) as T;
      }
      recordCacheOperation(cacheType, 'read', 'miss');
    } catch {
      recordCacheOperation(cacheType, 'read', 'fail_open');
      // Redis is an optimization; read-through continues to MongoDB when cache access fails.
    }

    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const load = loader().then(async (value) => {
      if (store) await store(value);
      else try {
        const jitter = this.jitterSeconds ? Math.floor(Math.random() * (this.jitterSeconds + 1)) : 0;
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds + jitter);
        recordCacheOperation(cacheType, 'write', 'success');
      } catch {
        recordCacheOperation(cacheType, 'write', 'fail_open');
        // Keep the successful source-of-truth read even if Redis cannot store it.
      }
      return value;
    }).finally(() => { if (this.inFlight.get(key) === load) this.inFlight.delete(key); });
    this.inFlight.set(key, load);
    return load;
  }

  async invalidate(patientId: string, predictionId: string): Promise<void> {
    const key = this.key(patientId, predictionId);
    this.inFlight.delete(key);
    try {
      await this.redis.multi().incr(this.epochKey(key)).del(key).exec();
      recordCacheOperation('report', 'invalidate', 'success');
    } catch { recordCacheOperation('report', 'invalidate', 'fail_open'); }
  }

  async invalidateKey(key: string): Promise<void> {
    try { await this.redis.del(key); } catch { /* A bounded TTL handles invalidation outages. */ }
  }

  async generation(namespace: string): Promise<number> {
    try { return Number(await this.redis.get(`carelens:cache-generation:${namespace}`) ?? 0); }
    catch { return 0; }
  }

  async bumpGeneration(namespace: string): Promise<void> {
    try { await this.redis.incr(`carelens:cache-generation:${namespace}`); } catch { /* Version cache expires after its short TTL. */ }
  }

  private key(patientId: string, predictionId: string): string {
    const digest = createHash('sha256').update(`${patientId}:${predictionId}`).digest('hex');
    return `carelens:report:v1:${digest}`;
  }

  private epochKey(key: string): string { return `${key}:epoch`; }
}
