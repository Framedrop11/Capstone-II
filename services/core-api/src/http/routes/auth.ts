import type { Express, RequestHandler } from "express";
import { randomBytes } from "node:crypto";
import { authorizationTransactionCookieName } from "../../auth/transaction-cookie.js";
import { refreshCookieName } from "../../auth/cookies.js";
import { AuthenticationError } from "../../auth/errors.js";
import {
  authenticateAccessToken,
  authorizeRoles,
} from "../../auth/middleware.js";
import type { CoreApiDependencies } from "../api-types.js";
import { readCookie } from "../cookies.js";

function setCookies(...cookies: string[]): string[] {
  return cookies.filter(Boolean);
}

function popupCompletionHtml(
  login: {
    accessToken: string;
    userId: string;
    role: "patient" | "doctor" | "admin";
  },
  targetOrigin: string,
  nonce: string,
): string {
  const payload = JSON.stringify({
    type: "carelens:auth-complete",
    accessToken: login.accessToken,
    userId: login.userId,
    role: login.role,
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const safeOrigin = JSON.stringify(targetOrigin);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>CareLens sign in</title></head><body><p id="status">Sign-in complete. You can return to CareLens.</p><script nonce="${nonce}">(function(){const targetOrigin=${safeOrigin};const message=${payload};if(window.opener){window.opener.postMessage(message,targetOrigin);window.close();}})();</script></body></html>`;
}

export function registerAuthRoutes(
  app: Express,
  dependencies: CoreApiDependencies,
): void {
  app.get("/api/v1/auth/login", async (request, response, next) => {
    try {
      const responseMode =
        request.query["response_mode"] === "popup" ? "popup" : "json";
      const requestedMockRole = request.query["mock_role"];
      const mockRole = ["patient", "doctor", "admin"].includes(
        String(requestedMockRole),
      )
        ? (requestedMockRole as "patient" | "doctor" | "admin")
        : undefined;
      const login = await dependencies.authService.beginLogin(
        new Date(),
        responseMode,
        mockRole,
      );
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Set-Cookie", login.transactionCookie);
      response.redirect(302, login.authorizationUrl);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/v1/auth/callback", async (request, response, next) => {
    try {
      // OAuth providers may add response metadata (for example, Google's scope).
      // Only code, state, and issuer are consumed; the issuer is checked by the OIDC client.
      const code = request.query["code"];
      const state = request.query["state"];
      const issuer = request.query["iss"];
      const transactionCookie = readCookie(
        request,
        authorizationTransactionCookieName,
      );
      if (
        typeof code !== "string" ||
        typeof state !== "string" ||
        !transactionCookie
      )
        throw new AuthenticationError();
      const callback = new URL(dependencies.oidcRedirectUri);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", state);
      if (typeof issuer === "string") callback.searchParams.set("iss", issuer);
      const login = await dependencies.authService.completeLogin(
        callback.toString(),
        transactionCookie,
      );
      response.setHeader(
        "Set-Cookie",
        setCookies(login.refreshCookie, login.clearTransactionCookie ?? ""),
      );
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (login.responseMode === "popup") {
        const nonce = randomBytes(18).toString("base64url");
        const origin = new URL(dependencies.oidcRedirectUri).origin;
        response.setHeader(
          "Content-Security-Policy",
          `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
        );
        response
          .type("html")
          .status(200)
          .send(popupCompletionHtml(login, origin, nonce));
        return;
      }
      response
        .status(200)
        .json({
          accessToken: login.accessToken,
          userId: login.userId,
          role: login.role,
        });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/auth/refresh", async (request, response, next) => {
    try {
      const token = readCookie(request, refreshCookieName);
      if (!token) throw new AuthenticationError();
      const login = await dependencies.authService.rotateRefreshToken(token);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Set-Cookie", login.refreshCookie);
      response
        .status(200)
        .json({
          accessToken: login.accessToken,
          userId: login.userId,
          role: login.role,
        });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/auth/logout", async (request, response, next) => {
    try {
      const token = readCookie(request, refreshCookieName) ?? "";
      const clearCookie = await dependencies.authService.logout(token);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Set-Cookie", clearCookie);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

export function bearerRoute(
  tokens: CoreApiDependencies["accessTokens"],
  ...roles: ("patient" | "doctor" | "admin")[]
): RequestHandler[] {
  return [authenticateAccessToken(tokens), authorizeRoles(...roles)];
}
