import assert from 'node:assert/strict';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import test from 'node:test';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { AuthenticationError, AuthorizationError } from '../../services/core-api/src/auth/errors.js';
import { authenticateAccessToken, authorizeRoles } from '../../services/core-api/src/auth/middleware.js';

const tokens = new AccessTokenService({
  secret: new TextEncoder().encode('express-auth-test-secret-minimum-32-bytes'),
  issuer: 'https://carelens.test',
  audience: 'carelens-api',
});

function buildApp(): express.Express {
  const app = express();
  const authentication = authenticateAccessToken(tokens);
  app.get('/patient', authentication, authorizeRoles('patient'), (req, res) => res.json({ role: req.authPrincipal?.role }));
  app.get('/doctor', authentication, authorizeRoles('doctor'), (req, res) => res.json({ role: req.authPrincipal?.role }));
  app.get('/admin', authentication, authorizeRoles('admin'), (req, res) => res.json({ role: req.authPrincipal?.role }));
  const errors: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (!(error instanceof AuthenticationError || error instanceof AuthorizationError)) return next(error);
    const statusCode = error.statusCode;
    res.status(statusCode).json({ error: error instanceof Error ? error.message : 'Internal error' });
  };
  app.use(errors);
  return app;
}

test('authentication middleware rejects missing, malformed, expired and tampered bearer tokens', async () => {
  const app = buildApp();
  assert.equal((await request(app).get('/patient')).status, 401);
  assert.equal((await request(app).get('/patient').set('Authorization', 'Basic invalid')).status, 401);
  const expired = await tokens.issue('u-expired', 'patient', new Date('2020-01-01T00:00:00Z'));
  assert.equal((await request(app).get('/patient').set('Authorization', `Bearer ${expired}`)).status, 401);
  const issued = await tokens.issue('u-tampered', 'patient');
  const parts = issued.split('.');
  const payload = parts[1];
  assert.ok(payload);
  parts[1] = `${payload.slice(0, -1)}x`;
  assert.equal((await request(app).get('/patient').set('Authorization', `Bearer ${parts.join('.')}`)).status, 401);
});

test('RBAC middleware checks every role against patient, doctor and admin routes', async () => {
  const app = buildApp();
  const roles = ['patient', 'doctor', 'admin'] as const;
  const paths = ['/patient', '/doctor', '/admin'] as const;
  for (const path of paths) {
    for (const role of roles) {
      const token = await tokens.issue(`user-${role}`, role);
      const response = await request(app).get(path).set('Authorization', `Bearer ${token}`);
      const allowed = path === `/${role}`;
      assert.equal(response.status, allowed ? 200 : 403, `${role} access to ${path}`);
    }
  }
});
