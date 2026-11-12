import type { Types } from 'mongoose';
import { Patient, User } from '../data/models.js';
import { AuthenticationError, InvalidRefreshTokenError } from './errors.js';
import { AccessTokenService } from './access-tokens.js';
import { clearRefreshCookie, serializeRefreshCookie } from './cookies.js';
import { RefreshSessionService } from './refresh-sessions.js';
import {
  clearAuthorizationTransactionCookie,
  createAuthorizationTransaction,
  decodeAuthorizationTransaction,
  encodeAuthorizationTransaction,
  serializeAuthorizationTransactionCookie,
} from './transaction-cookie.js';
import type { AuthEnvironment, OidcProvider } from './types.js';

export interface AuthServiceConfig {
  environment: AuthEnvironment;
  provider: OidcProvider;
  redirectUri: string;
  transactionCookieKey: Uint8Array;
  accessTokens: AccessTokenService;
  refreshSessions: RefreshSessionService;
}

export interface LoginStart {
  authorizationUrl: string;
  transactionCookie: string;
}

export interface LoginResult {
  accessToken: string;
  refreshCookie: string;
  clearTransactionCookie?: string;
  userId: string;
  role: 'patient' | 'doctor' | 'admin';
}

export class AuthService {
  constructor(private readonly config: AuthServiceConfig) {
    if (!config.redirectUri.startsWith('https://') && !['local', 'dev', 'test'].includes(config.environment)) {
      throw new Error('OIDC redirect URI must use HTTPS outside local/development/test');
    }
    if (config.transactionCookieKey.byteLength < 32) throw new Error('OIDC transaction cookie key must be at least 32 bytes');
  }

  async beginLogin(now = new Date()): Promise<LoginStart> {
    const transaction = createAuthorizationTransaction(Math.floor(now.getTime() / 1000));
    const authorizationUrl = await this.config.provider.authorizationUrl(transaction, this.config.redirectUri);
    const value = encodeAuthorizationTransaction(transaction, this.config.transactionCookieKey);
    return { authorizationUrl, transactionCookie: serializeAuthorizationTransactionCookie(value) };
  }

  async completeLogin(callbackUrl: string, transactionCookieValue: string, now = new Date()): Promise<LoginResult> {
    let transaction;
    try {
      transaction = decodeAuthorizationTransaction(
        transactionCookieValue,
        this.config.transactionCookieKey,
        Math.floor(now.getTime() / 1000),
      );
    } catch {
      throw new AuthenticationError('OIDC login transaction is invalid or expired');
    }

    let identity;
    try {
      identity = await this.config.provider.completeAuthorization(callbackUrl, transaction, this.config.redirectUri);
    } catch {
      throw new AuthenticationError('OIDC authorization could not be completed');
    }
    const authProvider = `${this.config.provider.kind}:${identity.subject}`;
    const user = await User.findOneAndUpdate(
      { authProvider },
      {
        $set: { name: identity.name, email: identity.email },
        $setOnInsert: { role: 'patient' },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();
    if (!user) throw new AuthenticationError('User account could not be created');
    if (user.role === 'patient') {
      await Patient.updateOne(
        { userId: user._id },
        { $setOnInsert: { userId: user._id } },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true },
      ).exec();
    }

    const userId = (user._id as Types.ObjectId).toString();
    const accessToken = await this.config.accessTokens.issue(userId, user.role);
    const refresh = await this.config.refreshSessions.create(userId, now);
    return {
      accessToken,
      refreshCookie: serializeRefreshCookie(refresh.token, refresh.maxAgeSeconds),
      clearTransactionCookie: clearAuthorizationTransactionCookie(),
      userId,
      role: user.role,
    };
  }

  async rotateRefreshToken(rawToken: string, now = new Date()): Promise<LoginResult> {
    const refresh = await this.config.refreshSessions.rotate(rawToken, now);
    const user = await User.findById(refresh.userId).exec();
    if (!user) {
      await this.config.refreshSessions.revokeFamily(refresh.token, now);
      throw new InvalidRefreshTokenError();
    }
    return {
      accessToken: await this.config.accessTokens.issue(refresh.userId, user.role, now),
      refreshCookie: serializeRefreshCookie(refresh.token, refresh.maxAgeSeconds),
      userId: refresh.userId,
      role: user.role,
    };
  }

  async logout(rawToken: string, now = new Date()): Promise<string> {
    await this.config.refreshSessions.revokeFamily(rawToken, now);
    return clearRefreshCookie();
  }
}
