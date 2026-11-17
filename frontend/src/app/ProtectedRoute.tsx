import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthSession } from '../shared/auth/useAuthSession';
import type { SessionRole } from '../shared/auth/session';

export function ProtectedRoute({ role }: { role: SessionRole }) {
  const { snapshot } = useAuthSession();
  const location = useLocation();

  if (snapshot.status === 'loading') {
    return (
      <main className="cl-route-status" role="status" aria-live="polite">
        Checking your session…
      </main>
    );
  }
  if (snapshot.status === 'anonymous') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (snapshot.role !== role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
