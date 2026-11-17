import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthSessionProvider } from '../shared/auth/AuthSessionProvider';
import { AuthSession } from '../shared/auth/session';

function renderRoute(session: AuthSession, route: string, role: 'patient' | 'doctor' | 'admin') {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Public sign in</p> },
      { path: '/forbidden', element: <h1>Access denied</h1> },
      {
        element: <ProtectedRoute role={role} />,
        children: [{ path: '/workspace', element: <h1>{role} workspace</h1> }],
      },
    ],
    { initialEntries: [route] },
  );
  return render(
    <AuthSessionProvider session={session} restoreOnMount={false}>
      <RouterProvider router={router} />
    </AuthSessionProvider>,
  );
}

describe('role-protected route shell', () => {
  it('shows a non-sensitive loading state while restoring a session', () => {
    renderRoute(new AuthSession(), '/workspace', 'patient');
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  });

  it('sends an anonymous user to sign in and a different role to the 403 page', async () => {
    const anonymous = new AuthSession({
      baseUrl: 'http://localhost',
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: 'Unauthorized', requestId: 'test' }), { status: 401 }),
    });
    await anonymous.restore();
    renderRoute(anonymous, '/workspace', 'patient');
    expect(await screen.findByText('Public sign in')).toBeInTheDocument();

    const patient = new AuthSession();
    const popup = {} as MessageEventSource;
    patient.acceptPopupMessage(
      {
        origin: 'http://localhost',
        source: popup,
        data: {
          type: 'carelens:auth-complete',
          accessToken: 'memory-only',
          userId: 'user-1',
          role: 'patient',
        },
      },
      popup,
      'http://localhost',
    );
    renderRoute(patient, '/workspace', 'doctor');
    expect(await screen.findByRole('heading', { name: 'Access denied' })).toBeInTheDocument();
  });
});
