import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AccessTokenService,
  accessTokenTtlSeconds,
} from "../../services/core-api/src/auth/access-tokens.js";
import { loadAuthRuntimeConfig } from "../../services/core-api/src/auth/config.js";
import {
  requireBearerToken,
  requireRole,
} from "../../services/core-api/src/auth/authorization.js";
import {
  clearRefreshCookie,
  serializeRefreshCookie,
} from "../../services/core-api/src/auth/cookies.js";
import {
  AuthenticationError,
  AuthorizationError,
} from "../../services/core-api/src/auth/errors.js";
import { createOidcProvider } from "../../services/core-api/src/auth/provider-factory.js";
import { createAuthRuntime } from "../../services/core-api/src/auth/runtime.js";
import {
  createAuthorizationTransaction,
  decodeAuthorizationTransaction,
  encodeAuthorizationTransaction,
  serializeAuthorizationTransactionCookie,
} from "../../services/core-api/src/auth/transaction-cookie.js";

const jwt = new AccessTokenService({
  secret: new TextEncoder().encode("0123456789abcdef0123456789abcdef"),
  issuer: "https://carelens.example",
  audience: "carelens-api",
});

test("issues a 15-minute JWT with an identity and role, and rejects expiry or tampering", async () => {
  const now = new Date("2026-11-12T00:00:00.000Z");
  const token = await jwt.issue("user-123", "doctor", now);
  const principal = await jwt.verify(token, now);
  assert.equal(principal.userId, "user-123");
  assert.equal(principal.role, "doctor");
  assert.equal(principal.expiresAt - principal.issuedAt, accessTokenTtlSeconds);
  await assert.rejects(
    jwt.verify(
      token,
      new Date(now.getTime() + accessTokenTtlSeconds * 1000 + 1),
    ),
    AuthenticationError,
  );
  const tokenParts = token.split(".");
  const tokenPayload = tokenParts[1];
  assert.ok(tokenPayload);
  tokenParts[1] = `${tokenPayload.slice(0, -1)}x`;
  const tampered = tokenParts.join(".");
  await assert.rejects(jwt.verify(tampered, now), AuthenticationError);
});

test("requires a well-formed bearer token and enforces role permissions", () => {
  assert.throws(() => requireBearerToken(undefined), AuthenticationError);
  assert.throws(() => requireBearerToken("Basic abc"), AuthenticationError);
  assert.equal(requireBearerToken("Bearer a.b.c"), "a.b.c");
  const principal = {
    userId: "patient-1",
    role: "patient" as const,
    tokenId: "jti",
    issuedAt: 1,
    expiresAt: 2,
  };
  assert.equal(requireRole(principal, "patient"), principal);
  assert.throws(() => requireRole(principal, "admin"), AuthorizationError);
  assert.throws(() => requireRole(undefined, "patient"), AuthenticationError);
});

test("protects OAuth state transaction with a signed, expiring cookie and PKCE challenge", () => {
  const key = new TextEncoder().encode("transaction-signing-key-32-bytes!");
  const transaction = createAuthorizationTransaction(1_800_000_000);
  assert.equal(
    transaction.codeChallenge,
    createHash("sha256").update(transaction.codeVerifier).digest("base64url"),
  );
  const cookie = encodeAuthorizationTransaction(transaction, key);
  assert.deepEqual(
    decodeAuthorizationTransaction(cookie, key, 1_800_000_120),
    transaction,
  );
  assert.throws(
    () => decodeAuthorizationTransaction(cookie, key, 1_800_000_301),
    /expired/,
  );
  assert.throws(
    () => decodeAuthorizationTransaction(`${cookie}x`, key, 1_800_000_120),
    /signature/,
  );
  assert.match(
    serializeAuthorizationTransactionCookie(cookie),
    /HttpOnly; Secure; SameSite=Lax/,
  );
});

test("binds the SPA popup response mode to the signed OIDC transaction cookie", () => {
  const key = new TextEncoder().encode("transaction-signing-key-32-bytes!");
  const transaction = createAuthorizationTransaction(1_800_000_000, "popup");
  const cookie = encodeAuthorizationTransaction(transaction, key);
  assert.equal(
    decodeAuthorizationTransaction(cookie, key, 1_800_000_001).responseMode,
    "popup",
  );
});

test("production and staging refuse mock OIDC while development uses the mock adapter", async () => {
  await assert.rejects(
    createOidcProvider({ environment: "prod", kind: "mock" }),
    /refuses to start/,
  );
  await assert.rejects(
    createOidcProvider({ environment: "staging", kind: "mock" }),
    /refuses to start/,
  );
  const provider = await createOidcProvider({
    environment: "dev",
    kind: "mock",
  });
  const transaction = createAuthorizationTransaction();
  const url = new URL(
    await provider.authorizationUrl(
      transaction,
      "http://localhost:3000/api/v1/auth/callback",
    ),
  );
  assert.equal(
    url.origin + url.pathname,
    "http://localhost:3000/api/v1/auth/callback",
  );
  assert.equal(url.searchParams.get("code"), "mock-valid-code");
  assert.equal(url.searchParams.get("state"), transaction.state);
});

test("startup config validates secrets and refuses mock authentication in production", async () => {
  const common = {
    CARELENS_ENV: "local",
    AUTH_PROVIDER: "mock",
    OIDC_REDIRECT_URI: "http://localhost:3000/api/v1/auth/callback",
    JWT_ISSUER: "http://localhost:3000",
    JWT_AUDIENCE: "carelens-api",
    JWT_SIGNING_SECRET: "local-jwt-secret-that-is-at-least-32-bytes",
    OIDC_TRANSACTION_KEY: "local-oidc-cookie-secret-at-least-32-bytes",
  };
  assert.equal(loadAuthRuntimeConfig(common).environment, "local");
  assert.deepEqual(
    loadAuthRuntimeConfig({ ...common, CARELENS_DEMO_ACCOUNT_ROLES: '{"demo@example.com":"doctor"}' }).demoAccountRoles,
    { 'demo@example.com': 'doctor' },
  );
  assert.throws(
    () => loadAuthRuntimeConfig({ ...common, CARELENS_ENV: 'staging', AUTH_PROVIDER: 'google', OIDC_REDIRECT_URI: 'https://example.test/api/v1/auth/callback', CARELENS_DEMO_ACCOUNT_ROLES: '{"demo@example.com":"admin"}' }),
    /only in the local environment/,
  );
  await assert.rejects(
    createAuthRuntime({ ...common, CARELENS_ENV: "prod" }),
    /refuses to start/,
  );
  assert.throws(
    () => loadAuthRuntimeConfig({ ...common, JWT_SIGNING_SECRET: "short" }),
    /32 non-placeholder bytes/,
  );
  assert.throws(
    () =>
      loadAuthRuntimeConfig({
        ...common,
        CARELENS_ENV: "prod",
        AUTH_PROVIDER: "google",
      }),
    /HTTPS/,
  );
  const runtime = await createAuthRuntime(common);
  const login = await runtime.beginLogin();
  assert.equal(new URL(login.authorizationUrl).origin, "http://localhost:3000");
  assert.equal(
    new URL(login.authorizationUrl).searchParams.get("code"),
    "mock-valid-code",
  );
});

test("local mock role hint is signed into the callback transaction and resolves to a seeded identity", async () => {
  const provider = await createOidcProvider({
    environment: "local",
    kind: "mock",
    mockDemoAccounts: true,
  });
  const transaction = createAuthorizationTransaction(
    1_800_000_000,
    "popup",
    "doctor",
  );
  const key = new TextEncoder().encode("transaction-signing-key-32-bytes!");
  const signed = encodeAuthorizationTransaction(transaction, key);
  const decoded = decodeAuthorizationTransaction(signed, key, 1_800_000_001);
  assert.equal(decoded.mockRole, "doctor");
  const callback = await provider.authorizationUrl(
    decoded,
    "http://localhost:8080/api/v1/auth/callback",
  );
  const identity = await provider.completeAuthorization(
    callback,
    decoded,
    "http://localhost:8080/api/v1/auth/callback",
  );
  assert.equal(identity.subject, "stage2-mock-doctor");
});

test("mock OIDC callback rejects state mismatch and invalid codes", async () => {
  const provider = await createOidcProvider({
    environment: "test",
    kind: "mock",
  });
  const transaction = createAuthorizationTransaction();
  await assert.rejects(
    provider.completeAuthorization(
      "http://localhost:3000/api/v1/auth/callback?code=mock-valid-code&state=wrong",
      transaction,
      "http://localhost:3000/api/v1/auth/callback",
    ),
    /state or callback URI/,
  );
  await assert.rejects(
    provider.completeAuthorization(
      `http://localhost:3000/api/v1/auth/callback?code=wrong&state=${transaction.state}`,
      transaction,
      "http://localhost:3000/api/v1/auth/callback",
    ),
    /authorization code/,
  );
});

test("refresh cookie is scoped, secure, httpOnly and cleared on logout", () => {
  const cookie = serializeRefreshCookie("raw-token", 3600);
  assert.match(
    cookie,
    /^carelensRefresh=raw-token; Path=\/api\/v1\/auth; Max-Age=3600;/,
  );
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(clearRefreshCookie(), /Max-Age=0/);
});

test("CARELENS_ROLE_ASSIGNMENTS maps verified emails to roles in every environment", () => {
  const google = {
    CARELENS_ENV: "staging",
    AUTH_PROVIDER: "google",
    OIDC_REDIRECT_URI: "https://example.test/api/v1/auth/callback",
    JWT_ISSUER: "https://example.test",
    JWT_AUDIENCE: "carelens-api",
    JWT_SIGNING_SECRET: "staging-jwt-secret-that-is-at-least-32-bytes",
    OIDC_TRANSACTION_KEY: "staging-oidc-cookie-secret-at-least-32-bytes",
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  };
  assert.deepEqual(loadAuthRuntimeConfig(google).roleAssignments, {});
  const config = loadAuthRuntimeConfig({
    ...google,
    CARELENS_ROLE_ASSIGNMENTS: JSON.stringify({
      "Doctor@Example.com": "doctor",
      " patient@example.com ": "patient",
      "admin@example.com": "admin",
    }),
  });
  assert.deepEqual(config.roleAssignments, {
    "doctor@example.com": "doctor",
    "patient@example.com": "patient",
    "admin@example.com": "admin",
  });
  assert.equal(config.roleAssignments["someone-else@example.com"], undefined);
  assert.deepEqual(config.demoAccountRoles, {});
});

test("CARELENS_ROLE_ASSIGNMENTS rejects malformed input", () => {
  const base = {
    CARELENS_ENV: "local",
    AUTH_PROVIDER: "mock",
    OIDC_REDIRECT_URI: "http://localhost:3000/api/v1/auth/callback",
    JWT_ISSUER: "http://localhost:3000",
    JWT_AUDIENCE: "carelens-api",
    JWT_SIGNING_SECRET: "local-jwt-secret-that-is-at-least-32-bytes",
    OIDC_TRANSACTION_KEY: "local-oidc-cookie-secret-at-least-32-bytes",
  };
  for (const bad of ["not json", "[]", '{"a@b.co":"superuser"}', '{"not-an-email":"admin"}']) {
    assert.throws(
      () => loadAuthRuntimeConfig({ ...base, CARELENS_ROLE_ASSIGNMENTS: bad }),
      /CARELENS_ROLE_ASSIGNMENTS/,
    );
  }
});