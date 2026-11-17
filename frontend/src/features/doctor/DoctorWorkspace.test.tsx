import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorWorkspace } from '../../app/routes/DoctorWorkspace';
import { AuthSessionContext } from '../../shared/auth/AuthSessionContext';
import { AuthSession } from '../../shared/auth/session';
import { server } from '../../test/server';
import { axe } from 'jest-axe';

const baseUrl = 'http://localhost';
const predictionId = 'cccccccccccccccccccccccc';

function renderDoctor() {
  const session = new AuthSession({ baseUrl });
  const popup = {} as MessageEventSource;
  session.acceptPopupMessage(
    {
      origin: baseUrl,
      source: popup,
      data: {
        type: 'carelens:auth-complete',
        accessToken: 'doctor-token',
        userId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        role: 'doctor',
      },
    },
    popup,
    baseUrl,
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthSessionContext.Provider value={{ session, snapshot: session.getSnapshot() }}>
      <QueryClientProvider client={queryClient}>
        <DoctorWorkspace />
      </QueryClientProvider>
    </AuthSessionContext.Provider>,
  );
}

describe('doctor workspace', () => {
  afterEach(() => cleanup());

  it('opens a scoped report and submits an outcome while access is active', async () => {
    let outcomeBody: unknown;
    server.use(
      http.get('*/api/v1/doctor/shared-patients', () =>
        HttpResponse.json({
          items: [
            {
              patientId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              predictionId,
              consentExpiresAt: '2026-12-01T00:00:00.000Z',
              sharedAt: '2026-11-13T00:00:00.000Z',
              riskBand: 'high',
            },
          ],
          nextCursor: null,
        }),
      ),
      http.post(`*/api/v1/doctor/reports/${predictionId}/access`, () =>
        HttpResponse.json({
          accessToken: 'scoped-report-token',
          expiresIn: 300,
          purpose: 'report:read',
        }),
      ),
      http.get(`*/api/v1/doctor/reports/${predictionId}`, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer scoped-report-token'
          ? HttpResponse.json({
              predictionId,
              basicScore: 0.72,
              riskBand: 'high',
              explanation: 'Screening factors contributed.',
              disclaimer: 'CareLens is a screening aid, not a diagnosis.',
            })
          : HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
      http.post('*/api/v1/doctor/outcomes', async ({ request }) => {
        outcomeBody = await request.json();
        return HttpResponse.json({ outcomeId: '1' }, { status: 201 });
      }),
    );
    const { container } = renderDoctor();
    expect(await axe(container)).toHaveProperty('violations', []);
    fireEvent.click(await screen.findByRole('button', { name: /Patient\s+aaaaaa/ }));
    expect(await screen.findByText('Access ends in')).toBeInTheDocument();
    expect(screen.getByText('Screening factors contributed.')).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Outcome note'), {
      target: { value: 'Follow-up assessment completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record outcome' }));
    await waitFor(() =>
      expect(outcomeBody).toEqual({
        predictionId,
        actualOutcome: 'Follow-up assessment completed',
      }),
    );
    expect(
      await screen.findByText('Outcome recorded. Thank you; this helps improve future screening.'),
    ).toBeInTheDocument();
  });

  it('moves keyboard focus through the worklist with j and k', async () => {
    server.use(
      http.get('*/api/v1/doctor/shared-patients', () =>
        HttpResponse.json({
          items: ['aaaaaaaaaaaaaaaaaaaaaaaa', 'dddddddddddddddddddddddd'].map((patientId) => ({
            patientId,
            predictionId:
              patientId === 'aaaaaaaaaaaaaaaaaaaaaaaa' ? predictionId : 'eeeeeeeeeeeeeeeeeeeeeeee',
            consentExpiresAt: '2026-12-01T00:00:00.000Z',
            sharedAt: '2026-11-13T00:00:00.000Z',
          })),
          nextCursor: null,
        }),
      ),
    );
    renderDoctor();
    const first = await screen.findByRole('button', { name: /Patient aaaaaa/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'j' });
    const second = screen.getByRole('button', { name: /Patient dddddd/ });
    await waitFor(() => expect(second).toHaveFocus());
    fireEvent.keyDown(second, { key: 'k' });
    await waitFor(() => expect(first).toHaveFocus());
  });

  it('shows an access-ended state when consent is revoked during report viewing', async () => {
    let reads = 0;
    server.use(
      http.get('*/api/v1/doctor/shared-patients', () =>
        HttpResponse.json({
          items: [
            {
              patientId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              predictionId,
              consentExpiresAt: '2026-12-01T00:00:00.000Z',
              sharedAt: '2026-11-13T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        }),
      ),
      http.post(`*/api/v1/doctor/reports/${predictionId}/access`, () =>
        HttpResponse.json({
          accessToken: 'scoped-report-token',
          expiresIn: 300,
          purpose: 'report:read',
        }),
      ),
      http.get(`*/api/v1/doctor/reports/${predictionId}`, () =>
        ++reads === 1
          ? HttpResponse.json({
              predictionId,
              disclaimer: 'CareLens is a screening aid, not a diagnosis.',
            })
          : HttpResponse.json({ message: 'Consent ended' }, { status: 409 }),
      ),
    );
    const intervalCallbacks: Array<() => void> = [];
    const intervalSpy = vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      if (typeof handler === 'function') intervalCallbacks.push(handler as () => void);
      return {} as unknown as ReturnType<typeof window.setInterval>;
    });
    renderDoctor();
    fireEvent.click(await screen.findByRole('button', { name: /Patient aaaaaa/ }));
    expect(await screen.findByText('Shared report')).toBeInTheDocument();
    await act(async () => {
      intervalCallbacks.at(-1)?.();
    });
    expect(await screen.findByText('Access has ended')).toBeInTheDocument();
    intervalSpy.mockRestore();
  });
});
