import { createApiClient } from '../../shared/api/client';
import { toFriendlyApiError } from '../../shared/api/errors';
import type { AuthSession } from '../../shared/auth/session';
import { getApiBaseUrl } from '../../shared/runtime-config';

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

function unwrap<T>(result: ApiResult<T>): T {
  if (result.error !== undefined || result.data === undefined) {
    throw toFriendlyApiError(result.response, result.error);
  }
  return result.data;
}

export function createPatientApi(session: AuthSession) {
  const client = createApiClient(session, {
    baseUrl: getApiBaseUrl(),
  });
  return {
    predictions: async () =>
      unwrap(await client.GET('/api/v1/patient/predictions', { params: { query: { limit: 50 } } })),
    report: async (predictionId: string) =>
      unwrap(
        await client.GET('/api/v1/patient/reports/{predictionId}', {
          params: { path: { predictionId } },
        }),
      ),
    consents: async () =>
      unwrap(await client.GET('/api/v1/patient/consents', { params: { query: { limit: 50 } } })),
    audit: async (cursor?: string) =>
      unwrap(
        await client.GET('/api/v1/patient/audit', {
          params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
        }),
      ),
    notifications: async () =>
      unwrap(
        await client.GET('/api/v1/patient/notifications', { params: { query: { limit: 50 } } }),
      ),
    doctors: async (query: string) =>
      unwrap(
        await client.GET('/api/v1/patient/doctors', { params: { query: { query, limit: 20 } } }),
      ),
    submitQuestionnaire: async (
      responses: {
        ageYears: number;
        bmi: number;
        waistCm: number;
        sex: 'female' | 'male';
        activity30MinDaily: boolean;
        fruitVegetablesDaily: boolean;
        antihypertensiveTreatment: boolean;
        historyHighGlucose: boolean;
        familyHistoryDiabetes: 'none' | 'second_degree' | 'first_degree';
      },
      idempotencyKey: string,
    ) =>
      unwrap(
        await client.POST('/api/v1/patient/questionnaires', {
          params: { header: { 'Idempotency-Key': idempotencyKey } },
          body: { responses },
        }),
      ),
    questionnaireStatus: async (questionnaireId: string) =>
      unwrap(
        await client.GET('/api/v1/patient/questionnaires/{questionnaireId}', {
          params: { path: { questionnaireId } },
        }),
      ),
    share: async (input: {
      doctorId: string;
      predictionId: string;
      scope: string;
      expiresAt: string;
    }) => unwrap(await client.POST('/api/v1/patient/consents', { body: input })),
    revoke: async (consentId: string) =>
      unwrap(
        await client.POST('/api/v1/patient/consents/{consentId}/revoke', {
          params: { path: { consentId } },
        }),
      ),
    markRead: async (notificationId: string) =>
      unwrap(
        await client.POST('/api/v1/patient/notifications/{notificationId}/read', {
          params: { path: { notificationId } },
        }),
      ),
  };
}

export type PatientApi = ReturnType<typeof createPatientApi>;
