import type { AuthEnvironment } from './types.js';
import { assertAuthProviderAllowed, type OidcProviderKind } from './provider-factory.js';

type Role = 'patient' | 'doctor' | 'admin';

export interface AuthRuntimeConfig {
  environment: AuthEnvironment;
  providerKind: OidcProviderKind;
  redirectUri: string;
  issuer: string;
  audience: string;
  jwtSigningSecret: Uint8Array;
  transactionCookieKey: Uint8Array;
  googleClientId?: string;
  googleClientSecret?: string;
  demoAccountRoles: Readonly<Record<string, Role>>;
  roleAssignments: Readonly<Record<string, Role>>;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readSecret(env: Env, name: string): Uint8Array {
  const value = required(env, name);
  const secret = new TextEncoder().encode(value);
  if (secret.byteLength < 32 || value.toLowerCase().includes('replace-me')) {
    throw new Error(`${name} must contain at least 32 non-placeholder bytes`);
  }
  return secret;
}

function parseEmailRoleMap(env: Env, name: string): Record<string, Role> {
  const result: Record<string, Role> = {};
  const raw = env[name]?.trim();
  if (!raw) return result;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`${name} must be a JSON object mapping emails to roles`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${name} must be a JSON object mapping emails to roles`);
  for (const [email, role] of Object.entries(parsed)) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !['patient', 'doctor', 'admin'].includes(String(role))) {
      throw new Error(`${name} contains an invalid email or role`);
    }
    result[normalizedEmail] = role as Role;
  }
  return result;
}

export function loadAuthRuntimeConfig(env: Env = process.env): AuthRuntimeConfig {
  const environment = required(env, 'CARELENS_ENV') as AuthEnvironment;
  if (!['local', 'dev', 'test', 'staging', 'prod'].includes(environment)) {
    throw new Error('CARELENS_ENV must be local, dev, test, staging, or prod');
  }
  const providerKind = required(env, 'AUTH_PROVIDER') as OidcProviderKind;
  if (providerKind !== 'google' && providerKind !== 'mock') throw new Error('AUTH_PROVIDER must be google or mock');
  assertAuthProviderAllowed(environment, providerKind);

  if (env['CARELENS_DEMO_ACCOUNT_ROLES']?.trim() && environment !== 'local') {
    throw new Error('CARELENS_DEMO_ACCOUNT_ROLES is supported only in the local environment');
  }
  const demoAccountRoles = parseEmailRoleMap(env, 'CARELENS_DEMO_ACCOUNT_ROLES');
  const roleAssignments = parseEmailRoleMap(env, 'CARELENS_ROLE_ASSIGNMENTS');

  const redirectUri = required(env, 'OIDC_REDIRECT_URI');
  const parsedRedirect = new URL(redirectUri);
  if (!['https:', 'http:'].includes(parsedRedirect.protocol)) throw new Error('OIDC_REDIRECT_URI must use HTTP or HTTPS');
  if (parsedRedirect.protocol !== 'https:' && !['local', 'dev', 'test'].includes(environment)) {
    throw new Error('OIDC_REDIRECT_URI must use HTTPS outside local/development/test');
  }

  const config: AuthRuntimeConfig = {
    environment,
    providerKind,
    redirectUri,
    issuer: required(env, 'JWT_ISSUER'),
    audience: required(env, 'JWT_AUDIENCE'),
    jwtSigningSecret: readSecret(env, 'JWT_SIGNING_SECRET'),
    transactionCookieKey: readSecret(env, 'OIDC_TRANSACTION_KEY'),
    demoAccountRoles,
    roleAssignments,
  };
  if (providerKind === 'google') {
    config.googleClientId = required(env, 'GOOGLE_CLIENT_ID');
    config.googleClientSecret = required(env, 'GOOGLE_CLIENT_SECRET');
  }
  return config;
}