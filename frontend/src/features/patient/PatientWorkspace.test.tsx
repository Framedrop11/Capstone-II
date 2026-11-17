import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PatientWorkspace } from '../../app/routes/PatientWorkspace';
import { AuthSessionContext } from '../../shared/auth/AuthSessionContext';
import { AuthSession } from '../../shared/auth/session';
import { server } from '../../test/server';

const baseUrl = 'http://localhost';
const patientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const doctorId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const predictionId = 'cccccccccccccccccccccccc';
const consentId = 'dddddddddddddddddddddddd';

function patientSession() {
  const session = new AuthSession({ baseUrl });
  const popup = {} as MessageEventSource;
  session.acceptPopupMessage(
    {
      origin: baseUrl,
      source: popup,
      data: {
        type: 'carelens:auth-complete',
        accessToken: 'patient-token',
        userId: patientId,
        role: 'patient',
      },
    },
    popup,
    baseUrl,
  );
  return session;
}

describe('patient workspace', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    let consent: Record<string, unknown> | null = null;
    server.use(
      http.get(`*/api/v1/patient/predictions`, () =>
        HttpResponse.json({
          items: [
            {
              predictionId,
              questionnaireId: 'eeeeeeeeeeeeeeeeeeeeeeee',
              status: 'complete',
              basicScore: 0.3,
              mlScore: null,
              scoreSource: 'basic_only',
              modelVersion: 'findrisc-v1',
              predictionTimestamp: '2026-11-13T12:00:00.000Z',
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get(`*/api/v1/patient/reports/${predictionId}`, () =>
        HttpResponse.json({
          predictionId,
          basicScore: 0.3,
          mlScore: null,
          scoreSource: 'basic_only',
          riskBand: 'moderate',
          factors: ['physical activity'],
          modelVersion: 'findrisc-v1',
          explanation: 'A few questionnaire factors contributed.',
          disclaimer: 'CareLens is a screening aid, not a diagnosis.',
        }),
      ),
      http.get(`*/api/v1/patient/consents`, () =>
        HttpResponse.json({ items: consent ? [consent] : [], nextCursor: null }),
      ),
      http.get(`*/api/v1/patient/audit`, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(`*/api/v1/patient/notifications`, () =>
        HttpResponse.json({ items: [], unreadCount: 0, nextCursor: null }),
      ),
      http.get(`*/api/v1/patient/doctors`, () =>
        HttpResponse.json({ items: [{ doctorId, name: 'Dr. Mehta' }] }),
      ),
      http.post(`*/api/v1/patient/consents`, async ({ request }) => {
        const body = (await request.json()) as {
          doctorId: string;
          predictionId: string;
          expiresAt: string;
        };
        consent = {
          consentId,
          patientId,
          doctorId: body.doctorId,
          doctorName: 'Dr. Mehta',
          predictionId: body.predictionId,
          scope: 'full_report',
          expiresAt: body.expiresAt,
          revoked: false,
          revokedAt: null,
        };
        return HttpResponse.json(consent, { status: 201 });
      }),
      http.post(`*/api/v1/patient/consents/${consentId}/revoke`, () => {
        if (consent) consent = { ...consent, revoked: true, revokedAt: new Date().toISOString() };
        return HttpResponse.json(consent);
      }),
    );
  });

  it('shows a basic-only report, shares with a selected doctor, and waits for confirmed revocation', async () => {
    const session = patientSession();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <AuthSessionContext.Provider value={{ session, snapshot: session.getSnapshot() }}>
        <QueryClientProvider client={queryClient}>
          <PatientWorkspace />
        </QueryClientProvider>
      </AuthSessionContext.Provider>,
    );

    expect(await screen.findByText('Your estimate is ready')).toBeInTheDocument();
    expect(screen.getAllByText('Basic score only')).toHaveLength(2);
    expect(await axe(container)).toHaveProperty('violations', []);
    fireEvent.click(screen.getByRole('button', { name: 'Sharing' }));
    fireEvent.click(await screen.findByRole('button', { name: /Dr\. Mehta/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Share this report' }));

    expect(
      await screen.findByText('Report access is now active for your selected doctor.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dr. Mehta')).toHaveLength(2);
    expect(await axe(container)).toHaveProperty('violations', []);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() =>
      expect(
        screen.getByText('No active shares. Your reports are private until you choose to share.'),
      ).toBeInTheDocument(),
    );
  });

  it('starts the check-up without pre-filled health answers and validates required input', async () => {
    const session = patientSession();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AuthSessionContext.Provider value={{ session, snapshot: session.getSnapshot() }}>
        <QueryClientProvider client={queryClient}>
          <PatientWorkspace />
        </QueryClientProvider>
      </AuthSessionContext.Provider>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Check-up' })[0]!);
    expect(screen.getByLabelText('How old are you?')).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('expected number');
    expect(screen.getByText(/STEP 1 OF 9/)).toBeInTheDocument();
  });
});
