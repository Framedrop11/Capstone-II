import {
  ClientSecretPost,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  type Configuration,
} from "openid-client";
import type {
  AuthorizationTransaction,
  OidcIdentity,
  OidcProvider,
} from "./types.js";

export class GoogleOidcProvider implements OidcProvider {
  readonly kind = "google" as const;

  private constructor(private readonly configuration: Configuration) {}

  static async create(
    clientId: string,
    clientSecret: string,
  ): Promise<GoogleOidcProvider> {
    if (!clientId || !clientSecret)
      throw new Error("Google OIDC client ID and secret are required");
    const configuration = await discovery(
      new URL("https://accounts.google.com"),
      clientId,
      { client_secret: clientSecret },
      ClientSecretPost(clientSecret),
    );
    return new GoogleOidcProvider(configuration);
  }

  async authorizationUrl(
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<string> {
    return buildAuthorizationUrl(this.configuration, {
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      prompt: "select_account",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: transaction.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
  }

  async completeAuthorization(
    callbackUrl: string,
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<OidcIdentity> {
    const responseUrl = new URL(callbackUrl);
    if (responseUrl.origin + responseUrl.pathname !== redirectUri) {
      throw new Error(
        "OIDC callback URL does not match the configured redirect URI",
      );
    }
    const tokens = await authorizationCodeGrant(
      this.configuration,
      responseUrl,
      {
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.codeVerifier,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    const subject = claims?.["sub"];
    const email = claims?.["email"];
    const emailVerified = claims?.["email_verified"];
    const name = claims?.["name"];
    if (
      typeof subject !== "string" ||
      typeof email !== "string" ||
      emailVerified !== true
    ) {
      throw new Error(
        "Google identity token is missing a verified subject or email",
      );
    }
    return {
      subject,
      email,
      emailVerified: true,
      name: typeof name === "string" ? name : email,
    };
  }
}

export class MockOidcProvider implements OidcProvider {
  readonly kind = "mock" as const;

  private readonly identities: Record<
    "patient" | "doctor" | "admin",
    OidcIdentity
  >;

  constructor(
    identities:
      Record<"patient" | "doctor" | "admin", OidcIdentity> | OidcIdentity,
  ) {
    this.identities =
      "patient" in identities
        ? identities
        : {
            patient: identities,
            doctor: identities,
            admin: identities,
          };
  }

  async authorizationUrl(
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<string> {
    const url = new URL(redirectUri);
    url.searchParams.set("code", "mock-valid-code");
    url.searchParams.set("state", transaction.state);
    return url.toString();
  }

  async completeAuthorization(
    callbackUrl: string,
    transaction: AuthorizationTransaction,
    redirectUri: string,
  ): Promise<OidcIdentity> {
    const response = new URL(callbackUrl);
    if (
      `${response.origin}${response.pathname}` !== redirectUri ||
      response.searchParams.get("state") !== transaction.state
    ) {
      throw new Error("Mock OIDC state or callback URI did not match");
    }
    if (response.searchParams.get("code") !== "mock-valid-code")
      throw new Error("Mock OIDC authorization code is invalid");
    return this.identities[transaction.mockRole ?? "patient"];
  }
}
