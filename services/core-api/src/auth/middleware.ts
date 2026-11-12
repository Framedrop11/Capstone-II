import type { RequestHandler } from 'express';
import { AccessTokenService } from './access-tokens.js';
import { requireBearerToken, requireRole } from './authorization.js';
import type { CareLensRole, Principal } from './types.js';

declare module 'express-serve-static-core' {
  interface Request {
    authPrincipal?: Principal;
  }
}

export function authenticateAccessToken(tokens: AccessTokenService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = requireBearerToken(request.get('authorization'));
      request.authPrincipal = await tokens.verify(token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authorizeRoles(...roles: CareLensRole[]): RequestHandler {
  if (roles.length === 0) throw new Error('At least one allowed role is required');
  return (request, _response, next) => {
    try {
      request.authPrincipal = requireRole(request.authPrincipal, ...roles);
      next();
    } catch (error) {
      next(error);
    }
  };
}
