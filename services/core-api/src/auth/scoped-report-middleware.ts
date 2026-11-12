import type { RequestHandler } from 'express';
import { requireBearerToken } from './authorization.js';
import { ScopedReportTokenService, type ScopedReportClaims } from './scoped-report-tokens.js';

declare module 'express-serve-static-core' {
  interface Request {
    scopedReport?: ScopedReportClaims;
  }
}

export function authenticateScopedReportToken(tokens: ScopedReportTokenService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const token = requireBearerToken(request.get('authorization'));
      const scopedReport = await tokens.verify(token);
      request.scopedReport = scopedReport;
      request.authPrincipal = {
        userId: scopedReport.doctorId,
        role: 'doctor',
        tokenId: scopedReport.tokenId,
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: scopedReport.expiresAt,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
