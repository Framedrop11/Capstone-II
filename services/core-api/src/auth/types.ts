export type CareLensRole = "patient" | "doctor" | "admin";
export type AuthEnvironment = "local" | "dev" | "test" | "staging" | "prod";

export interface OidcIdentity {
  subject: string;
  email: string;
  emailVerified: true;
  name: string;
}

export interface AuthorizationTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  issuedAt: number;
  responseMode?: "json" | "popup";
  mockRole?: CareLensRole;
}

export interface OidcProvider {
  readonly kind: "google" | "mock";
  authorizationUrl(
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<string>;
  completeAuthorization(
    callbackUrl: string,
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<OidcIdentity>;
}

export interface Principal {
  userId: string;
  role: CareLensRole;
  tokenId: string;
  issuedAt: number;
  expiresAt: number;
}
