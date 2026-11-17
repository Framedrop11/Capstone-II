import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { MongoDBContainer } from "@testcontainers/mongodb";
import { GenericContainer } from "testcontainers";
import { Redis } from "ioredis";
import request from "supertest";
import { AccessTokenService } from "../../services/core-api/src/auth/access-tokens.js";
import { AuthService } from "../../services/core-api/src/auth/auth-service.js";
import { MockOidcProvider } from "../../services/core-api/src/auth/oidc-provider.js";
import { RefreshSessionService } from "../../services/core-api/src/auth/refresh-sessions.js";
import { ScopedReportTokenService } from "../../services/core-api/src/auth/scoped-report-tokens.js";
import { Patient, User } from "../../services/core-api/src/data/models.js";
import { createCoreApi } from "../../services/core-api/src/http/app.js";
import type { CoreApiDependencies } from "../../services/core-api/src/http/api-types.js";

test(
  "popup OIDC callback hands the short-lived access token to the exact same origin",
  { timeout: 120_000 },
  async () => {
    const mongo = await new MongoDBContainer("mongo:7.0")
      .withUsername("root")
      .withPassword("root-password")
      .start();
    const redisContainer = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start();
    const mongoUrl = new URL(mongo.getConnectionString());
    mongoUrl.searchParams.set("directConnection", "true");
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const secret = new TextEncoder().encode(
      "popup-integration-secret-minimum-32-bytes",
    );
    const accessTokens = new AccessTokenService({
      secret,
      issuer: "http://localhost:3000",
      audience: "carelens-api",
    });
    const authService = new AuthService({
      environment: "test",
      provider: new MockOidcProvider({
        subject: "popup-user",
        email: "popup@example.test",
        emailVerified: true,
        name: "Popup Test",
      }),
      redirectUri: "http://localhost:3000/api/v1/auth/callback",
      transactionCookieKey: new TextEncoder().encode(
        "popup-oidc-transaction-secret-minimum-32",
      ),
      accessTokens,
      refreshSessions: new RefreshSessionService(3600),
    });

    try {
      await mongoose.connect(mongoUrl.toString(), {
        dbName: `carelens_popup_${Date.now()}`,
        autoIndex: false,
      });
      await Promise.all([User.createIndexes(), Patient.createIndexes()]);
      const app = await createCoreApi({
        environment: "test",
        oidcRedirectUri: "http://localhost:3000/api/v1/auth/callback",
        authService,
        accessTokens,
        scopedReportTokens: new ScopedReportTokenService(
          secret,
          "http://localhost:3000",
          "carelens-api",
        ),
        scoringQueue: {
          isReady: async () => true,
          enqueue: async () => {},
          close: async () => {},
        },
        queueRedis: redis,
        rateLimitRedis: redis,
      } as unknown as CoreApiDependencies);

      const start = await request(app)
        .get("/api/v1/auth/login?response_mode=popup")
        .expect(302);
      const authorization = new URL(start.headers["location"] as string);
      assert.equal(authorization.searchParams.has("accessToken"), false);
      const transactionCookieHeader = start.headers["set-cookie"];
      const transactionCookie = (
        Array.isArray(transactionCookieHeader)
          ? transactionCookieHeader[0]
          : transactionCookieHeader
      )!.split(";")[0]!;
      const callback = await request(app)
        .get(
          `/api/v1/auth/callback?code=mock-valid-code&state=${encodeURIComponent(authorization.searchParams.get("state")!)}`,
        )
        .set("Cookie", transactionCookie)
        .expect(200)
        .expect("Content-Type", /text\/html/);

      assert.equal(callback.headers["cache-control"], "no-store");
      assert.equal(callback.headers["referrer-policy"], "no-referrer");
      assert.match(
        callback.headers["content-security-policy"] ?? "",
        /script-src 'nonce-[A-Za-z0-9_-]+'/,
      );
      assert.match(callback.text, /window\.opener\.postMessage/);
      assert.match(callback.text, /"type":"carelens:auth-complete"/);
      assert.ok(
        callback.text.includes('const targetOrigin="http://localhost:3000"'),
      );
      const refreshCookies = callback.headers["set-cookie"];
      assert.ok(Array.isArray(refreshCookies));
      assert.ok(
        refreshCookies.some((cookie) =>
          cookie.startsWith("carelensRefresh="),
        ),
      );
      assert.equal(await Patient.countDocuments(), 1);
    } finally {
      await mongoose.disconnect();
      await Promise.all([redis.quit(), redisContainer.stop(), mongo.stop()]);
    }
  },
);
