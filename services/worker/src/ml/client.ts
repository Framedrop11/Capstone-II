import type { BasicScore } from '../scoring/findrisc.js';
import { CircuitBreaker } from './circuit-breaker.js';

export interface MlScore { score: number; modelVersion: string; factors: string[] }

export class MlClient {
  constructor(private readonly baseUrl: string | undefined, private readonly breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 })) {}

  async predict(responses: Record<string, unknown>, basic: BasicScore): Promise<MlScore> {
    if (!this.baseUrl) throw new Error('ML_SERVICE_URL is not configured');
    return this.breaker.execute(async () => {
      const response = await fetch(new URL('/predict', this.baseUrl!), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ responses, basicScore: basic.normalizedScore }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) throw new Error(`ML service returned ${response.status}`);
      const result = await response.json() as Record<string, unknown>;
      if (typeof result['score'] !== 'number' || !Number.isFinite(result['score']) || result['score'] < 0 || result['score'] > 1
        || typeof result['modelVersion'] !== 'string' || !Array.isArray(result['factors']) || !result['factors'].every((factor) => typeof factor === 'string')) {
        throw new Error('ML response has an invalid score contract');
      }
      return { score: result['score'], modelVersion: result['modelVersion'], factors: result['factors'] as string[] };
    });
  }
}
