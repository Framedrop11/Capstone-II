import type { AuthEnvironment } from './types.js';
import { assertAuthProviderAllowed, type OidcProviderKind } from './provider-factory.js';

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
  demoAccountRoles: Readonly<Record<string, 'patient' | 'doctor' | 'admin'>>;
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

export function loadAuthRuntimeConfig(env: Env = process.env): AuthRuntimeConfig {
  const environment = required(env, 'CARELENS_ENV') as AuthEnvironment;
  if (!['local', 'dev', 'test', 'staging', 'prod'].includes(environment)) {
    throw new Error('CARELENS_ENV must be local, dev, test, staging, or prod');
  }
  const providerKind = required(env, 'AUTH_PROVIDER') as OidcProviderKind;
  if (providerKind !== 'google' && providerKind !== 'mock') throw new Error('AUTH_PROVIDER must be google or mock');
  assertAuthProviderAllowed(environment, providerKind);
  const demoAccountRoles: Record<string, 'patient' | 'doctor' | 'admin'> = {};
  const rawDemoRoles = env['CARELENS_DEMO_ACCOUNT_ROLES']?.trim();
  if (rawDemoRoles) {
    if (environment !== 'local') throw new Error('CARELENS_DEMO_ACCOUNT_ROLES is supported only in the local environment');
    let parsed: unknown;
    try { parsed = JSON.parse(rawDemoRoles); } catch { throw new Error('CARELENS_DEMO_ACCOUNT_ROLES must be a JSON object mapping emails to roles'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('CARELENS_DEMO_ACCOUNT_ROLES must be a JSON object mapping emails to roles');
    for (const [email, role] of Object.entries(parsed)) {
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !['patient', 'doctor', 'admin'].includes(String(role))) {
        throw new Error('CARELENS_DEMO_ACCOUNT_ROLES contains an invalid email or role');
      }
      demoAccountRoles[normalizedEmail] = role as 'patient' | 'doctor' | 'admin';
    }
  }

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
  };
  if (providerKind === 'google') {
    config.googleClientId = required(env, 'GOOGLE_CLIENT_ID');
    config.googleClientSecret = required(env, 'GOOGLE_CLIENT_SECRET');
  }
  return config;
}
