import { AccessTokenService } from "./access-tokens.js";
import { AuthService } from "./auth-service.js";
import { loadAuthRuntimeConfig } from "./config.js";
import { createOidcProvider } from "./provider-factory.js";
import { RefreshSessionService } from "./refresh-sessions.js";
import { ScopedReportTokenService } from "./scoped-report-tokens.js";

export async function createAuthComponents(
  environment: Record<string, string | undefined> = process.env,
) {
  const config = loadAuthRuntimeConfig(environment);
  const provider = await createOidcProvider({
    environment: config.environment,
    kind: config.providerKind,
    mockDemoAccounts:
      config.environment === "local" &&
      environment["CARELENS_MOCK_DEMO_ACCOUNTS"] === "true",
    ...(config.googleClientId ? { googleClientId: config.googleClientId } : {}),
    ...(config.googleClientSecret
      ? { googleClientSecret: config.googleClientSecret }
      : {}),
  });
  const accessTokens = new AccessTokenService({
    secret: config.jwtSigningSecret,
    issuer: config.issuer,
    audience: config.audience,
  });
  return {
    config,
    accessTokens,
    scopedReportTokens: new ScopedReportTokenService(
      config.jwtSigningSecret,
      config.issuer,
      config.audience,
    ),
    authService: new AuthService({
      environment: config.environment,
      provider,
      redirectUri: config.redirectUri,
      transactionCookieKey: config.transactionCookieKey,
      accessTokens,
      refreshSessions: new RefreshSessionService(),
      demoAccountRoles: config.demoAccountRoles,
    }),
  };
}

export async function createAuthRuntime(
  environment: Record<string, string | undefined> = process.env,
): Promise<AuthService> {
  return (await createAuthComponents(environment)).authService;
}
