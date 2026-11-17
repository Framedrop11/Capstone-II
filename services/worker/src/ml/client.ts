import type { BasicScore } from '../scoring/findrisc.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { mlBreakerState, mlRequestDuration, mlRequests } from '../observability.js';

export interface MlScore { score: number; modelVersion: string; factors: string[] }

export class MlClient {
  constructor(private readonly baseUrl: string | undefined, private readonly breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })) {
    mlBreakerState.set(this.breaker.state === 'closed' ? 0 : this.breaker.state === 'open' ? 1 : 2);
  }

  async predict(responses: Record<string, unknown>, basic: BasicScore, correlationId?: string): Promise<MlScore> {
    if (!this.baseUrl) throw new Error('ML_SERVICE_URL is not configured');
    const started = process.hrtime.bigint();
    try {
      const result = await this.breaker.execute(async () => {
        const response = await fetch(new URL('/predict', this.baseUrl!), {
          method: 'POST', headers: { 'content-type': 'application/json', ...(correlationId ? { 'x-correlation-id': correlationId } : {}) },
          body: JSON.stringify({ responses, basicScore: basic.normalizedScore }),
          signal: AbortSignal.timeout(3_000),
        });
        if (!response.ok) throw new Error(`ML service returned ${response.status}`);
        const payload = await response.json() as Record<string, unknown>;
        if (typeof payload['score'] !== 'number' || !Number.isFinite(payload['score']) || payload['score'] < 0 || payload['score'] > 1
          || typeof payload['modelVersion'] !== 'string' || !Array.isArray(payload['factors']) || !payload['factors'].every((factor) => typeof factor === 'string')) {
          throw new Error('ML response has an invalid score contract');
        }
        return { score: payload['score'], modelVersion: payload['modelVersion'], factors: payload['factors'] as string[] };
      });
      mlRequests.inc({ result: 'success' });
      return result;
    } catch (error) {
      mlRequests.inc({ result: error instanceof Error && error.name === 'CircuitOpenError' ? 'breaker_open' : 'failure' });
      throw error;
    } finally {
      mlRequestDuration.observe(Number(process.hrtime.bigint() - started) / 1_000_000_000);
      mlBreakerState.set(this.breaker.state === 'closed' ? 0 : this.breaker.state === 'open' ? 1 : 2);
    }
  }
}
