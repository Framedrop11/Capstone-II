import { createApiClient } from '../../shared/api/client';
import { toFriendlyApiError } from '../../shared/api/errors';
import type { AuthSession } from '../../shared/auth/session';
import { getApiBaseUrl } from '../../shared/runtime-config';

type ApiResult<T> = { data?: T; error?: unknown; response: Response };
function unwrap<T>(result: ApiResult<T>): T {
  if (result.error !== undefined || result.data === undefined)
    throw toFriendlyApiError(result.response, result.error);
  return result.data;
}

export function createAdminApi(session: AuthSession) {
  const client = createApiClient(session, {
    baseUrl: getApiBaseUrl(),
  });
  return {
    users: async (cursor?: string) =>
      unwrap(
        await client.GET('/api/v1/admin/users', {
          params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
        }),
      ),
    updateRole: async (userId: string, role: 'patient' | 'doctor' | 'admin') =>
      unwrap(
        await client.PATCH('/api/v1/admin/users/{userId}/role', {
          params: { path: { userId } },
          body: { role },
        }),
      ),
    audit: async (
      filters: {
        patientId?: string;
        actorId?: string;
        action?: string;
        from?: string;
        to?: string;
      },
      cursor?: string,
    ) =>
      unwrap(
        await client.GET('/api/v1/admin/audit', {
          params: { query: { limit: 50, ...filters, ...(cursor ? { cursor } : {}) } },
        }),
      ),
    modelVersions: async (cursor?: string) =>
      unwrap(
        await client.GET('/api/v1/admin/model-versions', {
          params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
        }),
      ),
    modelCanary: async () => unwrap(await client.GET('/api/v1/admin/model-canary')),
    promote: async (version: string) =>
      unwrap(
        await client.POST('/api/v1/admin/model-versions/{version}/promote', {
          params: { path: { version } },
        }),
      ),
    rollback: async (version: string) =>
      unwrap(
        await client.POST('/api/v1/admin/model-versions/{version}/rollback', {
          params: { path: { version } },
        }),
      ),
    health: async () => unwrap(await client.GET('/api/v1/admin/system-health')),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
