import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AccessTokenService, accessTokenTtlSeconds } from '../../services/core-api/src/auth/access-tokens.js';
import { loadAuthRuntimeConfig } from '../../services/core-api/src/auth/config.js';
import { requireBearerToken, requireRole } from '../../services/core-api/src/auth/authorization.js';
import { clearRefreshCookie, serializeRefreshCookie } from '../../services/core-api/src/auth/cookies.js';
import { AuthenticationError, AuthorizationError } from '../../services/core-api/src/auth/errors.js';
import { createOidcProvider } from '../../services/core-api/src/auth/provider-factory.js';
import { createAuthRuntime } from '../../services/core-api/src/auth/runtime.js';
import {
  createAuthorizationTransaction,
  decodeAuthorizationTransaction,
  encodeAuthorizationTransaction,
  serializeAuthorizationTransactionCookie,
} from '../../services/core-api/src/auth/transaction-cookie.js';

const jwt = new AccessTokenService({
  secret: new TextEncoder().encode('0123456789abcdef0123456789abcdef'),
  issuer: 'https://carelens.example',
  audience: 'carelens-api',
});

test('issues a 15-minute JWT with an identity and role, and rejects expiry or tampering', async () => {
  const now = new Date('2026-11-12T00:00:00.000Z');
  const token = await jwt.issue('user-123', 'doctor', now);
  const principal = await jwt.verify(token, now);
  assert.equal(principal.userId, 'user-123');
  assert.equal(principal.role, 'doctor');
  assert.equal(principal.expiresAt - principal.issuedAt, accessTokenTtlSeconds);
  await assert.rejects(jwt.verify(token, new Date(now.getTime() + accessTokenTtlSeconds * 1000 + 1)), AuthenticationError);
  const tokenParts = token.split('.');
  const tokenPayload = tokenParts[1];
  assert.ok(tokenPayload);
  tokenParts[1] = `${tokenPayload.slice(0, -1)}x`;
  const tampered = tokenParts.join('.');
  await assert.rejects(jwt.verify(tampered, now), AuthenticationError);
});

test('requires a well-formed bearer token and enforces role permissions', () => {
  assert.throws(() => requireBearerToken(undefined), AuthenticationError);
  assert.throws(() => requireBearerToken('Basic abc'), AuthenticationError);
  assert.equal(requireBearerToken('Bearer a.b.c'), 'a.b.c');
  const principal = { userId: 'patient-1', role: 'patient' as const, tokenId: 'jti', issuedAt: 1, expiresAt: 2 };
  assert.equal(requireRole(principal, 'patient'), principal);
  assert.throws(() => requireRole(principal, 'admin'), AuthorizationError);
  assert.throws(() => requireRole(undefined, 'patient'), AuthenticationError);
});

test('protects OAuth state transaction with a signed, expiring cookie and PKCE challenge', () => {
  const key = new TextEncoder().encode('transaction-signing-key-32-bytes!');
  const transaction = createAuthorizationTransaction(1_800_000_000);
  assert.equal(transaction.codeChallenge, createHash('sha256').update(transaction.codeVerifier).digest('base64url'));
  const cookie = encodeAuthorizationTransaction(transaction, key);
  assert.deepEqual(decodeAuthorizationTransaction(cookie, key, 1_800_000_120), transaction);
  assert.throws(() => decodeAuthorizationTransaction(cookie, key, 1_800_000_301), /expired/);
  assert.throws(() => decodeAuthorizationTransaction(`${cookie}x`, key, 1_800_000_120), /signature/);
  assert.match(serializeAuthorizationTransactionCookie(cookie), /HttpOnly; Secure; SameSite=Lax/);
});

test('production and staging refuse mock OIDC while development uses the mock adapter', async () => {
  await assert.rejects(createOidcProvider({ environment: 'prod', kind: 'mock' }), /refuses to start/);
  await assert.rejects(createOidcProvider({ environment: 'staging', kind: 'mock' }), /refuses to start/);
  const provider = await createOidcProvider({ environment: 'dev', kind: 'mock' });
  const transaction = createAuthorizationTransaction();
  const url = new URL(await provider.authorizationUrl(transaction, 'http://localhost:3000/api/v1/auth/callback'));
  assert.equal(url.searchParams.get('state'), transaction.state);
  assert.equal(url.searchParams.get('code_challenge'), transaction.codeChallenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('startup config validates secrets and refuses mock authentication in production', async () => {
  const common = {
    CARELENS_ENV: 'local',
    AUTH_PROVIDER: 'mock',
    OIDC_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/callback',
    JWT_ISSUER: 'http://localhost:3000',
    JWT_AUDIENCE: 'carelens-api',
    JWT_SIGNING_SECRET: 'local-jwt-secret-that-is-at-least-32-bytes',
    OIDC_TRANSACTION_KEY: 'local-oidc-cookie-secret-at-least-32-bytes',
  };
  assert.equal(loadAuthRuntimeConfig(common).environment, 'local');
  await assert.rejects(createAuthRuntime({ ...common, CARELENS_ENV: 'prod' }), /refuses to start/);
  assert.throws(() => loadAuthRuntimeConfig({ ...common, JWT_SIGNING_SECRET: 'short' }), /32 non-placeholder bytes/);
  assert.throws(() => loadAuthRuntimeConfig({ ...common, CARELENS_ENV: 'prod', AUTH_PROVIDER: 'google' }), /HTTPS/);
  const runtime = await createAuthRuntime(common);
  const login = await runtime.beginLogin();
  assert.match(login.authorizationUrl, /^http:\/\/mock-oidc\.local/);
});

test('mock OIDC callback rejects state mismatch and invalid codes', async () => {
  const provider = await createOidcProvider({ environment: 'test', kind: 'mock' });
  const transaction = createAuthorizationTransaction();
  await assert.rejects(
    provider.completeAuthorization('http://localhost:3000/api/v1/auth/callback?code=mock-valid-code&state=wrong', transaction, 'http://localhost:3000/api/v1/auth/callback'),
    /state or callback URI/,
  );
  await assert.rejects(
    provider.completeAuthorization(`http://localhost:3000/api/v1/auth/callback?code=wrong&state=${transaction.state}`, transaction, 'http://localhost:3000/api/v1/auth/callback'),
    /authorization code/,
  );
});

test('refresh cookie is scoped, secure, httpOnly and cleared on logout', () => {
  const cookie = serializeRefreshCookie('raw-token', 3600);
  assert.match(cookie, /^carelensRefresh=raw-token; Path=\/api\/v1\/auth; Max-Age=3600;/);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(clearRefreshCookie(), /Max-Age=0/);
});
