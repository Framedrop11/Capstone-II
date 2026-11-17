import type { FriendlyApiError } from './errors';

export function isFriendlyApiError(error: unknown): error is FriendlyApiError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate['status'] === 'number' &&
    typeof candidate['message'] === 'string' &&
    Boolean(candidate['fieldErrors'] && typeof candidate['fieldErrors'] === 'object') &&
    (candidate['retryAfterMs'] === null || typeof candidate['retryAfterMs'] === 'number')
  );
}

export function shouldRetryQuery(
  failureCount: number,
  error: FriendlyApiError,
  method = 'GET',
): boolean {
  if (method !== 'GET' || failureCount >= 3) return false;
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

export function getQueryRetryDelay(
  attempt: number,
  retryAfterMs: number | null = null,
  random = Math.random,
): number {
  const exponentialCap = Math.min(1000 * 2 ** Math.max(0, attempt), 10_000);
  return Math.max(retryAfterMs ?? 0, Math.floor(random() * exponentialCap));
}

export function getQuestionnairePollDelay(pollCount: number): number {
  return Math.min(1000 * 2 ** Math.max(0, pollCount), 10_000);
}
