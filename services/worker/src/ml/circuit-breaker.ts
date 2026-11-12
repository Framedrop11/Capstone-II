export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions { failureThreshold: number; resetTimeoutMs: number; now?: () => number }

export class CircuitOpenError extends Error {
  constructor() { super('ML circuit breaker is open'); this.name = 'CircuitOpenError'; }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private halfOpenInFlight = false;
  private readonly now: () => number;
  private currentState: CircuitState = 'closed';

  constructor(private readonly options: CircuitBreakerOptions) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1 || options.resetTimeoutMs < 1) throw new Error('Invalid circuit breaker settings');
    this.now = options.now ?? Date.now;
  }

  get state(): CircuitState {
    if (this.currentState === 'open' && this.now() - this.openedAt >= this.options.resetTimeoutMs) return 'half_open';
    return this.currentState;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.state;
    if (state === 'open') throw new CircuitOpenError();
    if (state === 'half_open') {
      if (this.halfOpenInFlight) throw new CircuitOpenError();
      this.halfOpenInFlight = true;
    }
    try {
      const result = await operation();
      this.failures = 0;
      this.currentState = 'closed';
      return result;
    } catch (error) {
      this.failures += 1;
      if (state === 'half_open' || this.failures >= this.options.failureThreshold) {
        this.currentState = 'open';
        this.openedAt = this.now();
      }
      throw error;
    } finally {
      this.halfOpenInFlight = false;
    }
  }
}
