import type { AuthEnvironment, OidcProvider } from "./types.js";
import { GoogleOidcProvider, MockOidcProvider } from "./oidc-provider.js";

export type OidcProviderKind = "google" | "mock";

export interface OidcProviderConfig {
  environment: AuthEnvironment;
  kind: OidcProviderKind;
  mockDemoAccounts?: boolean;
  googleClientId?: string;
  googleClientSecret?: string;
}

export function assertAuthProviderAllowed(
  environment: AuthEnvironment,
  kind: OidcProviderKind,
): void {
  if (
    (environment === "prod" || environment === "staging") &&
    kind !== "google"
  ) {
    throw new Error(
      `${environment} profile refuses to start with mock or test authentication enabled`,
    );
  }
}

export async function createOidcProvider(
  config: OidcProviderConfig,
): Promise<OidcProvider> {
  assertAuthProviderAllowed(config.environment, config.kind);
  if (config.kind === "mock") {
    if (!config.mockDemoAccounts) {
      const patient = {
        subject: "stage2-mock-user",
        email: "mock-patient@example.test",
        emailVerified: true as const,
        name: "Mock Patient",
      };
      return new MockOidcProvider({ patient, doctor: patient, admin: patient });
    }
    return new MockOidcProvider({
      patient: {
        subject: "stage2-mock-user",
        email: "mock-patient@example.test",
        emailVerified: true,
        name: "Riya Demo",
      },
      doctor: {
        subject: "stage2-mock-doctor",
        email: "mock-doctor@example.test",
        emailVerified: true,
        name: "Dr. Mehta Demo",
      },
      admin: {
        subject: "stage2-mock-admin",
        email: "mock-admin@example.test",
        emailVerified: true,
        name: "CareLens Admin Demo",
      },
    });
  }
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new Error(
      "Google OIDC credentials are required when GOOGLE is selected",
    );
  }
  return GoogleOidcProvider.create(
    config.googleClientId,
    config.googleClientSecret,
  );
}
