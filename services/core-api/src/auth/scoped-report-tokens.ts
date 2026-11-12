import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AuthenticationError } from './errors.js';

const MAX_SCOPED_TOKEN_SECONDS = 5 * 60;

export interface ScopedReportClaims {
  doctorId: string;
  patientId: string;
  predictionId: string;
  purpose: 'report:read';
  tokenId: string;
  expiresAt: number;
}

export class ScopedReportTokenService {
  private readonly key: Uint8Array;

  constructor(secret: Uint8Array, private readonly issuer: string, private readonly audience: string) {
    if (secret.byteLength < 32) throw new Error('Scoped report JWT secret must be at least 32 bytes');
    this.key = secret;
  }

  async issue(doctorId: string, patientId: string, predictionId: string, expiresInSeconds = MAX_SCOPED_TOKEN_SECONDS, now = new Date()): Promise<string> {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_SCOPED_TOKEN_SECONDS) {
      throw new Error('Scoped doctor report token expiry must be between 1 and 300 seconds');
    }
    const issuedAt = Math.floor(now.getTime() / 1000);
    return new SignJWT({ role: 'doctor', patientId, predictionId, purpose: 'report:read' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(doctorId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + expiresInSeconds)
      .setJti(randomUUID())
      .sign(this.key);
  }

  async verify(token: string, now = new Date()): Promise<ScopedReportClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'], issuer: this.issuer, audience: this.audience, currentDate: now,
      });
      const patientId = payload['patientId'];
      const predictionId = payload['predictionId'];
      if (payload['role'] !== 'doctor' || payload['purpose'] !== 'report:read'
        || typeof payload.sub !== 'string' || typeof patientId !== 'string' || typeof predictionId !== 'string'
        || typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
        throw new AuthenticationError('Token is not scoped to a doctor report');
      }
      return { doctorId: payload.sub, patientId, predictionId, purpose: 'report:read', tokenId: payload.jti, expiresAt: payload.exp };
    } catch {
      throw new AuthenticationError('Scoped report token is invalid or expired');
    }
  }
}

export const scopedReportTokenMaxSeconds = MAX_SCOPED_TOKEN_SECONDS;
