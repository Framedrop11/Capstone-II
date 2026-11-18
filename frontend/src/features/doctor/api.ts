import createClient from 'openapi-fetch';
import type { paths } from '../../shared/api/schema';
import { createApiClient } from '../../shared/api/client';
import { toFriendlyApiError } from '../../shared/api/errors';
import type { AuthSession } from '../../shared/auth/session';
import { getApiBaseUrl } from '../../shared/runtime-config';

type Result<T> = { data?: T; error?: unknown; response: Response };
function unwrap<T>(result: Result<T>): T {
  if (result.error !== undefined || result.data === undefined)
    throw toFriendlyApiError(result.response, result.error);
  return result.data;
}

export function createDoctorApi(session: AuthSession) {
  const baseUrl = getApiBaseUrl();
  const client = createApiClient(session, { baseUrl });
  return {
    notifications: async () =>
      unwrap(
        await client.GET('/api/v1/doctor/notifications', { params: { query: { limit: 50 } } }),
      ),
    markNotificationRead: async (notificationId: string) =>
      unwrap(
        await client.POST('/api/v1/doctor/notifications/{notificationId}/read', {
          params: { path: { notificationId } },
        }),
      ),
    worklist: async () =>
      unwrap(
        await client.GET('/api/v1/doctor/shared-patients', { params: { query: { limit: 50 } } }),
      ),
    issueReportAccess: async (predictionId: string) =>
      unwrap(
        await client.POST('/api/v1/doctor/reports/{predictionId}/access', {
          params: { path: { predictionId } },
        }),
      ),
    readReport: async (predictionId: string, token: string) => {
      const scopedClient = createClient<paths>({
        baseUrl,
        fetch: (request) => fetch(request, { cache: 'no-store' }),
      });
      return unwrap(
        await scopedClient.GET('/api/v1/doctor/reports/{predictionId}', {
          params: { path: { predictionId } },
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' },
        }),
      );
    },
    submitOutcome: async (predictionId: string, actualOutcome: string) =>
      unwrap(
        await client.POST('/api/v1/doctor/outcomes', { body: { predictionId, actualOutcome } }),
      ),
  };
}

export type DoctorApi = ReturnType<typeof createDoctorApi>;
