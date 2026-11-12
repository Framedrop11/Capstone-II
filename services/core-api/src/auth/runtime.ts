import { AccessTokenService } from './access-tokens.js';
import { AuthService } from './auth-service.js';
import { loadAuthRuntimeConfig } from './config.js';
import { createOidcProvider } from './provider-factory.js';
import { RefreshSessionService } from './refresh-sessions.js';

export async function createAuthRuntime(environment: Record<string, string | undefined> = process.env): Promise<AuthService> {
  const config = loadAuthRuntimeConfig(environment);
  const provider = await createOidcProvider({
    environment: config.environment,
    kind: config.providerKind,
    ...(config.googleClientId ? { googleClientId: config.googleClientId } : {}),
    ...(config.googleClientSecret ? { googleClientSecret: config.googleClientSecret } : {}),
  });
  return new AuthService({
    environment: config.environment,
    provider,
    redirectUri: config.redirectUri,
    transactionCookieKey: config.transactionCookieKey,
    accessTokens: new AccessTokenService({
      secret: config.jwtSigningSecret,
      issuer: config.issuer,
      audience: config.audience,
    }),
    refreshSessions: new RefreshSessionService(),
  });
}
