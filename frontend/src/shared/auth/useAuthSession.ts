import { useContext } from 'react';
import { AuthSessionContext, type AuthSessionContextValue } from './AuthSessionContext';

export function useAuthSession(): AuthSessionContextValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error('useAuthSession must be used inside AuthSessionProvider');
  return value;
}
