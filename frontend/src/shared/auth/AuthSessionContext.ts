import { createContext } from 'react';
import type { AuthSession, SessionSnapshot } from './session';

export interface AuthSessionContextValue {
  session: AuthSession;
  snapshot: SessionSnapshot;
}

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);
