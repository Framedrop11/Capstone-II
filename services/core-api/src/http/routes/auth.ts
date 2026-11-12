import type { Express, RequestHandler } from 'express';
import { authorizationTransactionCookieName } from '../../auth/transaction-cookie.js';
import { refreshCookieName } from '../../auth/cookies.js';
import { AuthenticationError } from '../../auth/errors.js';
import { authenticateAccessToken, authorizeRoles } from '../../auth/middleware.js';
import type { CoreApiDependencies } from '../api-types.js';
import { readCookie } from '../cookies.js';

function setCookies(...cookies: string[]): string[] {
  return cookies.filter(Boolean);
}

export function registerAuthRoutes(app: Express, dependencies: CoreApiDependencies): void {
  app.get('/api/v1/auth/login', async (_request, response, next) => {
    try {
      const login = await dependencies.authService.beginLogin();
      response.setHeader('Set-Cookie', login.transactionCookie);
      response.redirect(302, login.authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/auth/callback', async (request, response, next) => {
    try {
      const code = request.query['code'];
      const state = request.query['state'];
      const transactionCookie = readCookie(request, authorizationTransactionCookieName);
      if (typeof code !== 'string' || typeof state !== 'string' || !transactionCookie) throw new AuthenticationError();
      const callback = new URL(dependencies.oidcRedirectUri);
      callback.searchParams.set('code', code);
      callback.searchParams.set('state', state);
      const login = await dependencies.authService.completeLogin(callback.toString(), transactionCookie);
      response.setHeader('Set-Cookie', setCookies(login.refreshCookie, login.clearTransactionCookie ?? ''));
      response.status(200).json({ accessToken: login.accessToken, userId: login.userId, role: login.role });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/auth/refresh', async (request, response, next) => {
    try {
      const token = readCookie(request, refreshCookieName);
      if (!token) throw new AuthenticationError();
      const login = await dependencies.authService.rotateRefreshToken(token);
      response.setHeader('Set-Cookie', login.refreshCookie);
      response.status(200).json({ accessToken: login.accessToken, userId: login.userId, role: login.role });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/auth/logout', async (request, response, next) => {
    try {
      const token = readCookie(request, refreshCookieName) ?? '';
      const clearCookie = await dependencies.authService.logout(token);
      response.setHeader('Set-Cookie', clearCookie);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

export function bearerRoute(tokens: CoreApiDependencies['accessTokens'], ...roles: ('patient' | 'doctor' | 'admin')[]): RequestHandler[] {
  return [authenticateAccessToken(tokens), authorizeRoles(...roles)];
}
