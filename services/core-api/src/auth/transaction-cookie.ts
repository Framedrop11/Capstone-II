import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { AuthorizationTransaction } from "./types.js";

const TRANSACTION_TTL_SECONDS = 5 * 60;
const COOKIE_NAME = "carelensOidcTransaction";

export function createAuthorizationTransaction(
  nowSeconds = Math.floor(Date.now() / 1000),
  responseMode: "json" | "popup" = "json",
  mockRole?: AuthorizationTransaction["mockRole"],
): AuthorizationTransaction {
  const verifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    codeVerifier: verifier,
    codeChallenge,
    issuedAt: nowSeconds,
    responseMode,
    ...(mockRole ? { mockRole } : {}),
  };
}

function sign(payload: string, key: Uint8Array): Buffer {
  return createHmac("sha256", key).update(payload).digest();
}

export function encodeAuthorizationTransaction(
  transaction: AuthorizationTransaction,
  key: Uint8Array,
): string {
  if (key.byteLength < 32)
    throw new Error("OIDC transaction signing key must be at least 32 bytes");
  const payload = Buffer.from(JSON.stringify(transaction)).toString(
    "base64url",
  );
  return `${payload}.${sign(payload, key).toString("base64url")}`;
}

export function decodeAuthorizationTransaction(
  cookieValue: string,
  key: Uint8Array,
  nowSeconds = Math.floor(Date.now() / 1000),
): AuthorizationTransaction {
  if (key.byteLength < 32)
    throw new Error("OIDC transaction signing key must be at least 32 bytes");
  const parts = cookieValue.split(".");
  if (parts.length !== 2) throw new Error("Invalid OIDC transaction cookie");
  const [payload, signature] = parts;
  if (!payload || !signature)
    throw new Error("Invalid OIDC transaction cookie");
  const expected = sign(payload, key);
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    throw new Error("Invalid OIDC transaction cookie");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid OIDC transaction cookie signature");
  }

  let transaction: AuthorizationTransaction;
  try {
    transaction = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AuthorizationTransaction;
  } catch {
    throw new Error("Invalid OIDC transaction payload");
  }
  const age = nowSeconds - transaction.issuedAt;
  if (
    !transaction.state ||
    !transaction.nonce ||
    !transaction.codeVerifier ||
    !transaction.codeChallenge ||
    (transaction.responseMode !== undefined &&
      !["json", "popup"].includes(transaction.responseMode)) ||
    (transaction.mockRole !== undefined &&
      !["patient", "doctor", "admin"].includes(transaction.mockRole)) ||
    age < 0 ||
    age > TRANSACTION_TTL_SECONDS
  ) {
    throw new Error("OIDC transaction has expired or is malformed");
  }
  return transaction;
}

export function serializeAuthorizationTransactionCookie(
  value: string,
  secure = true,
): string {
  return `${COOKIE_NAME}=${value}; Path=/api/v1/auth/callback; Max-Age=${TRANSACTION_TTL_SECONDS}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax`;
}

export function clearAuthorizationTransactionCookie(secure = true): string {
  return `${COOKIE_NAME}=; Path=/api/v1/auth/callback; Max-Age=0; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax`;
}

export const authorizationTransactionCookieName = COOKIE_NAME;
