import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspace } from '../../app/routes/AdminWorkspace';
import { AuthSessionContext } from '../../shared/auth/AuthSessionContext';
import { AuthSession } from '../../shared/auth/session';
import { server } from '../../test/server';
import { axe } from 'jest-axe';

const baseUrl = 'http://localhost';
const adminId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const patientId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function renderAdmin() {
  const session = new AuthSession({ baseUrl });
  const popup = {} as MessageEventSource;
  session.acceptPopupMessage(
    {
      origin: baseUrl,
      source: popup,
      data: {
        type: 'carelens:auth-complete',
        accessToken: 'admin-token',
        userId: adminId,
        role: 'admin',
      },
    },
    popup,
    baseUrl,
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthSessionContext.Provider value={{ session, snapshot: session.getSnapshot() }}>
      <QueryClientProvider client={queryClient}>
        <AdminWorkspace />
      </QueryClientProvider>
    </AuthSessionContext.Provider>,
  );
}

describe('admin workspace', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads health/users/models, updates a role, filters audit, and promotes an eligible model', async () => {
    let role: 'patient' | 'doctor' | 'admin' = 'patient';
    let auditUrl = '';
    let promoted = false;
    server.use(
      http.get('*/api/v1/admin/system-health', () =>
        HttpResponse.json({
          status: 'ready',
          database: true,
          queue: true,
          cache: true,
          degraded: false,
        }),
      ),
      http.get('*/api/v1/admin/model-canary', () =>
        HttpResponse.json({ status: 'unavailable', canaryController: null }),
      ),
      http.get('*/api/v1/admin/users', () =>
        HttpResponse.json({
          items: [{ userId: patientId, name: 'Riya Sen', email: 'riya@example.test', role }],
          nextCursor: null,
        }),
      ),
      http.patch(`*/api/v1/admin/users/${patientId}/role`, async ({ request }) => {
        role = ((await request.json()) as { role: typeof role }).role;
        return HttpResponse.json({
          userId: patientId,
          name: 'Riya Sen',
          email: 'riya@example.test',
          role,
        });
      }),
      http.get('*/api/v1/admin/audit', ({ request }) => {
        auditUrl = request.url;
        return HttpResponse.json({
          items: Array.from({ length: 20_000 }, (_, index) => ({
            auditLogId: `audit-${index}`,
            actorId: adminId,
            patientId,
            action: index === 0 ? 'revoke_consent' : 'view_report',
            modelVersion: null,
            timestamp: '2026-11-14T10:00:00.000Z',
          })),
          nextCursor: null,
        });
      }),
      http.get('*/api/v1/admin/model-versions', () =>
        HttpResponse.json({
          items: [
            {
              version: 'findrisc-v2',
              status: promoted ? 'stable' : 'candidate',
              canaryTrafficPercent: 0,
              artifactUri: 'registry://models/findrisc-v2',
              testResults: { promotionEligible: true },
              promotedAt: promoted ? '2026-11-14T10:00:00.000Z' : null,
            },
          ],
          nextCursor: null,
        }),
      ),
      http.post('*/api/v1/admin/model-versions/findrisc-v2/promote', () => {
        promoted = true;
        return HttpResponse.json({
          version: 'findrisc-v2',
          status: 'stable',
          canaryTrafficPercent: 0,
          artifactUri: 'registry://models/findrisc-v2',
          testResults: { promotionEligible: true },
          promotedAt: '2026-11-14T10:00:00.000Z',
        });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderAdmin();
    expect(await screen.findByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Grafana dashboard' })).toHaveAttribute(
      'href',
      'http://localhost:3001',
    );
    expect(await screen.findByText('Riya Sen')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Role for Riya Sen'), { target: { value: 'doctor' } });
    await waitFor(() => expect(role).toBe('doctor'));
    fireEvent.change(screen.getByLabelText('Patient ID'), { target: { value: patientId } });
    fireEvent.click(screen.getByRole('button', { name: 'Search audit' }));
    expect(await screen.findByText('revoke_consent')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeLessThan(100);
    expect(await axe(container)).toHaveProperty('violations', []);
    await waitFor(() => expect(new URL(auditUrl).searchParams.get('patientId')).toBe(patientId));
    fireEvent.click(await screen.findByRole('button', { name: 'Promote' }));
    expect(
      screen.getByRole('progressbar', { name: 'Canary traffic share: 0%' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(promoted).toBe(true));
    expect(await screen.findByText('Model findrisc-v2 is now stable.')).toBeInTheDocument();
  });
});
