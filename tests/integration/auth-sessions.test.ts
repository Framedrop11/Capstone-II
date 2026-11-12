import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { Patient, User, RefreshToken } from '../../services/core-api/src/data/models.js';
import { AccessTokenService } from '../../services/core-api/src/auth/access-tokens.js';
import { AuthService } from '../../services/core-api/src/auth/auth-service.js';
import { MockOidcProvider } from '../../services/core-api/src/auth/oidc-provider.js';
import { RefreshTokenReuseError } from '../../services/core-api/src/auth/errors.js';
import { hashRefreshToken, RefreshSessionService } from '../../services/core-api/src/auth/refresh-sessions.js';

test('OIDC login creates patient session, refresh rotates, and reuse revokes the token family', { timeout: 120_000 }, async () => {
  const container = await new MongoDBContainer('mongo:7.0')
    .withUsername('root')
    .withPassword('root-password')
    .start();
  try {
    const mongoUrl = new URL(container.getConnectionString());
    mongoUrl.searchParams.set('directConnection', 'true');
    await mongoose.connect(mongoUrl.toString(), {
      dbName: `carelens_auth_test_${Date.now()}`,
      autoIndex: false,
    });

    const sessions = new RefreshSessionService(3600);
    const tokens = new AccessTokenService({
      secret: new TextEncoder().encode('access-signing-secret-at-least-32-bytes'),
      issuer: 'https://carelens.example',
      audience: 'carelens-api',
    });
    const auth = new AuthService({
      environment: 'test',
      provider: new MockOidcProvider({
        subject: 'google-test-subject-1',
        email: 'riya@example.test',
        emailVerified: true,
        name: 'Riya Patient',
      }),
      redirectUri: 'http://localhost:3000/api/v1/auth/callback',
      transactionCookieKey: new TextEncoder().encode('transaction-cookie-secret-32-bytes!'),
      accessTokens: tokens,
      refreshSessions: sessions,
    });

    const start = await auth.beginLogin();
    const authorizationUrl = new URL(start.authorizationUrl);
    const cookiePair = start.transactionCookie.split(';')[0];
    assert.ok(cookiePair);
    const cookieValue = cookiePair.slice(cookiePair.indexOf('=') + 1);
    const state = authorizationUrl.searchParams.get('state');
    assert.ok(state);
    const login = await auth.completeLogin(
      `http://localhost:3000/api/v1/auth/callback?code=mock-valid-code&state=${encodeURIComponent(state)}`,
      cookieValue,
    );
    assert.equal(login.role, 'patient');
    const patient = await User.findById(login.userId).exec();
    assert.equal(patient?.email, 'riya@example.test');
    assert.equal(await Patient.countDocuments({ userId: login.userId }), 1);
    assert.equal((await tokens.verify(login.accessToken)).role, 'patient');

    const firstRawToken = login.refreshCookie.split(';')[0]?.split('=')[1];
    assert.ok(firstRawToken);
    const firstRecord = await RefreshToken.findOne({ tokenHash: hashRefreshToken(firstRawToken) }).exec();
    assert.ok(firstRecord);
    assert.notEqual(firstRecord.tokenHash, firstRawToken);

    const rotated = await auth.rotateRefreshToken(firstRawToken);
    const secondRawToken = rotated.refreshCookie.split(';')[0]?.split('=')[1];
    assert.ok(secondRawToken);
    assert.equal((await tokens.verify(rotated.accessToken)).userId, login.userId);

    await assert.rejects(auth.rotateRefreshToken(firstRawToken), RefreshTokenReuseError);
    await assert.rejects(auth.rotateRefreshToken(secondRawToken), RefreshTokenReuseError);
    const family = await RefreshToken.find({ familyId: firstRecord.familyId }).exec();
    assert.equal(family.length, 2);
    assert.ok(family.every((record) => record.revokedAt instanceof Date));

    const logoutSession = await sessions.create(login.userId);
    const logoutCookie = await auth.logout(logoutSession.token);
    assert.match(logoutCookie, /Max-Age=0/);
    const logoutRecord = await RefreshToken.findOne({ tokenHash: hashRefreshToken(logoutSession.token) }).exec();
    assert.ok(logoutRecord?.revokedAt instanceof Date);
  } finally {
    await mongoose.disconnect();
    await container.stop();
  }
});
