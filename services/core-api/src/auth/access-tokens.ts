import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AuthenticationError } from './errors.js';
import type { CareLensRole, Principal } from './types.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const validRoles = new Set<CareLensRole>(['patient', 'doctor', 'admin']);

export interface AccessTokenConfig {
  secret: Uint8Array;
  issuer: string;
  audience: string;
}

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(private readonly config: AccessTokenConfig) {
    if (config.secret.byteLength < 32) throw new Error('JWT signing secret must be at least 32 bytes');
    if (!config.issuer || !config.audience) throw new Error('JWT issuer and audience are required');
    this.key = config.secret;
  }

  async issue(userId: string, role: CareLensRole, now = new Date()): Promise<string> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .setJti(randomUUID())
      .sign(this.key);
  }

  async verify(token: string, now = new Date()): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.config.issuer,
        audience: this.config.audience,
        currentDate: now,
      });
      const role = payload['role'];
      if (typeof payload.sub !== 'string' || typeof role !== 'string' || !validRoles.has(role as CareLensRole)
        || typeof payload.iat !== 'number' || typeof payload.exp !== 'number' || typeof payload.jti !== 'string') {
        throw new AuthenticationError();
      }
      return {
        userId: payload.sub,
        role: role as CareLensRole,
        tokenId: payload.jti,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      };
    } catch {
      throw new AuthenticationError();
    }
  }
}

export const accessTokenTtlSeconds = ACCESS_TOKEN_TTL_SECONDS;
