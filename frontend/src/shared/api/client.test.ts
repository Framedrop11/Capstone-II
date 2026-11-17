import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { AuthSession } from '../auth/session';
import { createApiClient } from './client';
import { toFriendlyApiError } from './errors';
import { getQuestionnairePollDelay, getQueryRetryDelay, shouldRetryQuery } from './query-policy';
import { submitQuestionnaire } from './questionnaires';

const baseUrl = 'http://localhost';
const predictionsUrl = `${baseUrl}/api/v1/patient/predictions`;
const refreshUrl = `${baseUrl}/api/v1/auth/refresh`;

function authenticatedSession() {
  const session = new AuthSession({ baseUrl });
  const popup = {} as MessageEventSource;
  const message = {
    origin: baseUrl,
    source: popup,
    data: {
      type: 'carelens:auth-complete',
      accessToken: 'expired-access-token',
      userId: 'user-1',
      role: 'patient',
    },
  } as Pick<MessageEvent, 'origin' | 'source' | 'data'>;
  expect(session.acceptPopupMessage(message, popup, baseUrl)).toBe(true);
  return session;
}

describe('typed API client and session retry policy', () => {
  it('refreshes once for concurrent 401s, then retries safe GET requests', async () => {
    const session = authenticatedSession();
    let refreshCalls = 0;
    let rejectedCalls = 0;
    server.use(
      http.post(refreshUrl, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return HttpResponse.json({
          accessToken: 'fresh-access-token',
          userId: 'user-1',
          role: 'patient',
        });
      }),
      http.get(predictionsUrl, ({ request }) => {
        const authorization = request.headers.get('Authorization');
        if (authorization !== 'Bearer fresh-access-token') {
          rejectedCalls += 1;
          return HttpResponse.json({ error: 'Unauthorized', requestId: 'test' }, { status: 401 });
        }
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    const api = createApiClient(session, { baseUrl });
    const results = await Promise.all([
      api.GET('/api/v1/patient/predictions'),
      api.GET('/api/v1/patient/predictions'),
      api.GET('/api/v1/patient/predictions'),
    ]);

    expect(results.every((result) => result.response.status === 200)).toBe(true);
    expect(rejectedCalls).toBe(3);
    expect(refreshCalls).toBe(1);
    expect(session.getAccessToken()).toBe('fresh-access-token');
  });

  it('replays an idempotent questionnaire submit with the same key after refresh', async () => {
    const session = authenticatedSession();
    let submissions = 0;
    let idempotencyKey = '';
    server.use(
      http.post(refreshUrl, () =>
        HttpResponse.json({ accessToken: 'fresh-access-token', userId: 'user-1', role: 'patient' }),
      ),
      http.post(`${baseUrl}/api/v1/patient/questionnaires`, async ({ request }) => {
        submissions += 1;
        idempotencyKey = request.headers.get('Idempotency-Key') ?? '';
        if (request.headers.get('Authorization') !== 'Bearer fresh-access-token') {
          return HttpResponse.json({ error: 'Unauthorized', requestId: 'test' }, { status: 401 });
        }
        return HttpResponse.json(
          {
            questionnaireId: 'questionnaire-1',
            status: 'pending',
            submittedAt: new Date().toISOString(),
          },
          { status: 202 },
        );
      }),
    );

    const result = await submitQuestionnaire(
      createApiClient(session, { baseUrl }),
      {
        ageYears: 40,
        bmi: 24,
        waistCm: 78,
        sex: 'female',
        activity30MinDaily: true,
        fruitVegetablesDaily: true,
        antihypertensiveTreatment: false,
        historyHighGlucose: false,
        familyHistoryDiabetes: 'none',
      },
      'journey-attempt-1',
    );

    expect(result.response.status).toBe(202);
    expect(submissions).toBe(2);
    expect(idempotencyKey).toBe('journey-attempt-1');
  });

  it('refreshes a non-idempotent mutation but does not replay it', async () => {
    const session = authenticatedSession();
    let mutationCalls = 0;
    server.use(
      http.post(refreshUrl, () =>
        HttpResponse.json({ accessToken: 'fresh-access-token', userId: 'user-1', role: 'patient' }),
      ),
      http.post(`${baseUrl}/api/v1/patient/consents`, () => {
        mutationCalls += 1;
        return HttpResponse.json({ error: 'Unauthorized', requestId: 'test' }, { status: 401 });
      }),
    );

    const result = await createApiClient(session, { baseUrl }).POST('/api/v1/patient/consents', {
      body: {
        doctorId: 'doctor-1',
        predictionId: '0123456789abcdef01234567',
        scope: 'basicScore',
        expiresAt: new Date().toISOString(),
      },
    });

    expect(result.response.status).toBe(401);
    expect(mutationCalls).toBe(1);
    expect(session.getAccessToken()).toBe('fresh-access-token');
  });

  it('maps API status responses to safe messages, fields and Retry-After delays', async () => {
    const cases = [
      {
        status: 400,
        message: 'Check the highlighted information and try again.',
        payload: {
          error: 'Invalid',
          requestId: 'x',
          details: [{ path: 'body.responses.ageYears', message: 'Must be an adult' }],
        },
        field: 'ageYears',
      },
      {
        status: 401,
        message: 'Your session has ended. Sign in to continue.',
        payload: { error: 'Unauthorized', requestId: 'x' },
      },
      {
        status: 403,
        message: 'You do not have access to this information.',
        payload: { error: 'Forbidden', requestId: 'x' },
      },
      {
        status: 404,
        message: 'We could not find that information.',
        payload: { error: 'Not found', requestId: 'x' },
      },
      {
        status: 409,
        message:
          'This action conflicts with an existing request. Review the current information and try again.',
        payload: { error: 'Conflict', requestId: 'x' },
      },
      {
        status: 429,
        message: 'You are doing that a little too often. Please wait and try again.',
        payload: { error: 'Rate limited', requestId: 'x' },
        retryAfter: '3',
      },
      {
        status: 503,
        message: 'CareLens is having trouble right now. Please try again shortly.',
        payload: { error: 'database secret details', requestId: 'x' },
      },
    ];

    for (const item of cases) {
      server.use(
        http.get(predictionsUrl, () =>
          HttpResponse.json(item.payload, {
            status: item.status,
            ...(item.retryAfter ? { headers: { 'Retry-After': item.retryAfter } } : {}),
          }),
        ),
        http.post(refreshUrl, () =>
          HttpResponse.json({ error: 'Unauthorized', requestId: 'x' }, { status: 401 }),
        ),
      );
      const result = await createApiClient(new AuthSession({ baseUrl }), { baseUrl }).GET(
        '/api/v1/patient/predictions',
      );
      const friendly = toFriendlyApiError(result.response, result.error);
      expect(friendly.message).toBe(item.message);
      expect(friendly.message).not.toContain('database secret');
      if (item.status === 400) expect(friendly.fieldErrors['ageYears']).toBe('Must be an adult');
      if (item.status === 429) expect(friendly.retryAfterMs).toBe(3000);
    }
  });

  it('uses bounded GET-only retries and exponentially backs off questionnaire polling', () => {
    const failure = { status: 503, message: 'safe', fieldErrors: {}, retryAfterMs: null };
    expect(shouldRetryQuery(0, failure)).toBe(true);
    expect(shouldRetryQuery(3, failure)).toBe(false);
    expect(shouldRetryQuery(0, failure, 'POST')).toBe(false);
    expect(getQueryRetryDelay(2, null, () => 0.5)).toBe(2000);
    expect(getQueryRetryDelay(2, 5000, () => 0.5)).toBe(5000);
    expect(getQuestionnairePollDelay(0)).toBe(1000);
    expect(getQuestionnairePollDelay(10)).toBe(10_000);
  });
});
