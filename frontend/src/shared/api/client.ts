import createClient from 'openapi-fetch';
import type { paths } from './schema';
import type { AuthSession } from '../auth/session';

export function canReplayAfterRefresh(request: Request): boolean {
  return (
    ['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) ||
    request.headers.has('Idempotency-Key')
  );
}

export function createApiClient(
  session: AuthSession,
  options: { baseUrl?: string; fetchImpl?: typeof fetch } = {},
) {
  const baseUrl = options.baseUrl ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;

  return createClient<paths>({
    baseUrl,
    fetch: async (original: Request) => {
      const requestHeaders = new Headers(original.headers);
      const accessToken = session.getAccessToken();
      if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
      const authorizedRequest = new Request(original.clone(), { headers: requestHeaders });
      const firstResponse = await fetchImpl(authorizedRequest.clone());
      if (firstResponse.status !== 401) return firstResponse;

      const refreshed = await session.refresh();
      const refreshedToken = session.getAccessToken();
      if (!refreshed || !refreshedToken || !canReplayAfterRefresh(original)) return firstResponse;

      const retryHeaders = new Headers(original.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      return fetchImpl(new Request(original.clone(), { headers: retryHeaders }));
    },
  });
}

export type CareLensApiClient = ReturnType<typeof createApiClient>;
