import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AuthSession } from './session';
import { AuthSessionContext } from './AuthSessionContext';
const defaultSession = new AuthSession();

export function AuthSessionProvider({
  children,
  session = defaultSession,
  restoreOnMount = true,
}: {
  children: ReactNode;
  session?: AuthSession;
  restoreOnMount?: boolean;
}) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  useEffect(() => {
    if (restoreOnMount) void session.restore();
  }, [restoreOnMount, session]);
  const value = useMemo(() => ({ session, snapshot }), [session, snapshot]);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
