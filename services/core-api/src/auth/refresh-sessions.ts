import { createHash, randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { RefreshToken } from '../data/models.js';
import { InvalidRefreshTokenError, RefreshTokenReuseError } from './errors.js';

const DEFAULT_REFRESH_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export interface RefreshSession {
  token: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  maxAgeSeconds: number;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

export class RefreshSessionService {
  constructor(private readonly lifetimeSeconds = DEFAULT_REFRESH_LIFETIME_SECONDS) {
    if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 60) throw new Error('Refresh token lifetime must be at least one minute');
  }

  async create(userId: string, now = new Date()): Promise<RefreshSession> {
    const token = mintToken();
    const expiresAt = new Date(now.getTime() + this.lifetimeSeconds * 1000);
    const familyId = randomUUID();
    await RefreshToken.create({ userId, tokenHash: hashRefreshToken(token), familyId, expiresAt });
    return { token, userId, familyId, expiresAt, maxAgeSeconds: this.lifetimeSeconds };
  }

  async rotate(token: string, now = new Date()): Promise<RefreshSession> {
    if (!token) throw new InvalidRefreshTokenError();
    const session = await mongoose.startSession();
    let replacement: RefreshSession | undefined;
    let failure: Error | undefined;
    try {
      await session.withTransaction(async () => {
        replacement = undefined;
        failure = undefined;
        const previous = await RefreshToken.findOne({ tokenHash: hashRefreshToken(token) }).session(session).exec();
        if (!previous) {
          failure = new InvalidRefreshTokenError();
          return;
        }
        if (previous.revokedAt || previous.expiresAt.getTime() <= now.getTime()) {
          await RefreshToken.updateMany(
            { familyId: previous.familyId, revokedAt: null },
            { $set: { revokedAt: now } },
            { session },
          ).exec();
          failure = previous.revokedAt ? new RefreshTokenReuseError() : new InvalidRefreshTokenError();
          return;
        }

        const nextToken = mintToken();
        const nextHash = hashRefreshToken(nextToken);
        const update = await RefreshToken.updateOne(
          { _id: previous._id, revokedAt: null, expiresAt: { $gt: now } },
          { $set: { revokedAt: now, replacedByTokenHash: nextHash } },
          { session },
        ).exec();
        if (update.modifiedCount !== 1) {
          await RefreshToken.updateMany(
            { familyId: previous.familyId, revokedAt: null },
            { $set: { revokedAt: now } },
            { session },
          ).exec();
          failure = new RefreshTokenReuseError();
          return;
        }

        const expiresAt = new Date(now.getTime() + this.lifetimeSeconds * 1000);
        await RefreshToken.create([{
          userId: previous.userId,
          tokenHash: nextHash,
          familyId: previous.familyId,
          expiresAt,
        }], { session });
        replacement = {
          token: nextToken,
          userId: previous.userId.toString(),
          familyId: previous.familyId,
          expiresAt,
          maxAgeSeconds: this.lifetimeSeconds,
        };
      });
    } finally {
      await session.endSession();
    }
    if (failure) throw failure;
    if (!replacement) throw new InvalidRefreshTokenError();
    return replacement;
  }

  async revokeFamily(token: string, now = new Date()): Promise<void> {
    if (!token) return;
    const current = await RefreshToken.findOne({ tokenHash: hashRefreshToken(token) }).select({ familyId: 1 }).lean().exec();
    if (!current) return;
    await RefreshToken.updateMany(
      { familyId: current.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    ).exec();
  }
}

export const refreshTokenLifetimeSeconds = DEFAULT_REFRESH_LIFETIME_SECONDS;
