import { AuthorizationError, AuthenticationError } from './errors.js';
import type { CareLensRole, Principal } from './types.js';

export function requireBearerToken(header: string | undefined): string {
  if (!header) throw new AuthenticationError();
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  if (!match?.[1]) throw new AuthenticationError('A valid Bearer access token is required');
  return match[1];
}

export function requireRole(principal: Principal | undefined, ...allowedRoles: CareLensRole[]): Principal {
  if (!principal) throw new AuthenticationError();
  if (!allowedRoles.includes(principal.role)) throw new AuthorizationError();
  return principal;
}
