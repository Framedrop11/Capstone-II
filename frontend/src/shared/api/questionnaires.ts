import type { CareLensApiClient } from './client';
import type { components } from './schema';

type FindriscResponses = components['schemas']['FindriscResponses'];

export function submitQuestionnaire(
  api: CareLensApiClient,
  responses: FindriscResponses,
  idempotencyKey: string = crypto.randomUUID(),
) {
  return api.POST('/api/v1/patient/questionnaires', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: { responses },
  });
}
