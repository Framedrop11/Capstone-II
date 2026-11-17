export interface FriendlyApiError {
  status: number;
  message: string;
  fieldErrors: Record<string, string>;
  retryAfterMs: number | null;
}

const messages: Record<number, string> = {
  400: 'Check the highlighted information and try again.',
  401: 'Your session has ended. Sign in to continue.',
  403: 'You do not have access to this information.',
  404: 'We could not find that information.',
  409: 'This action conflicts with an existing request. Review the current information and try again.',
  429: 'You are doing that a little too often. Please wait and try again.',
};

function retryAfterMilliseconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function extractFieldErrors(payload: unknown): Record<string, string> {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as Record<string, unknown>)['details'])
  )
    return {};
  const result: Record<string, string> = {};
  for (const item of (payload as { details: unknown[] }).details) {
    if (!item || typeof item !== 'object') continue;
    const detail = item as Record<string, unknown>;
    const path = detail['path'] ?? detail['instancePath'] ?? detail['property'];
    const message = detail['message'];
    if (typeof path === 'string' && typeof message === 'string') {
      const field =
        path
          .replace(/^body\.responses\./, '')
          .replace(/^\//, '')
          .replaceAll('/', '.') || 'form';
      result[field] = message;
    }
  }
  return result;
}

export function toFriendlyApiError(
  response: Pick<Response, 'status' | 'headers'>,
  payload: unknown,
): FriendlyApiError {
  const status = response.status;
  const message =
    status >= 500
      ? 'CareLens is having trouble right now. Please try again shortly.'
      : (messages[status] ?? 'Something went wrong. Please try again.');
  return {
    status,
    message,
    fieldErrors: status === 400 ? extractFieldErrors(payload) : {},
    retryAfterMs:
      status === 429 ? retryAfterMilliseconds(response.headers.get('Retry-After')) : null,
  };
}
