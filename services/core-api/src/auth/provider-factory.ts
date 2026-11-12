import type { AuthEnvironment, OidcProvider } from './types.js';
import { GoogleOidcProvider, MockOidcProvider } from './oidc-provider.js';

export type OidcProviderKind = 'google' | 'mock';

export interface OidcProviderConfig {
  environment: AuthEnvironment;
  kind: OidcProviderKind;
  googleClientId?: string;
  googleClientSecret?: string;
}

export function assertAuthProviderAllowed(environment: AuthEnvironment, kind: OidcProviderKind): void {
  if ((environment === 'prod' || environment === 'staging') && kind !== 'google') {
    throw new Error(`${environment} profile refuses to start with mock or test authentication enabled`);
  }
}

export async function createOidcProvider(config: OidcProviderConfig): Promise<OidcProvider> {
  assertAuthProviderAllowed(config.environment, config.kind);
  if (config.kind === 'mock') {
    return new MockOidcProvider({
      subject: 'stage2-mock-user',
      email: 'mock-patient@example.test',
      emailVerified: true,
      name: 'Mock Patient',
    });
  }
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error('Google OIDC credentials are required when GOOGLE is selected');
  }
  return GoogleOidcProvider.create(config.googleClientId, config.googleClientSecret);
}
