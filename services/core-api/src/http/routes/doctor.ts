import type { Express } from 'express';
import { Types } from 'mongoose';
import { AuditLog, Consent, Outcome, Patient, Prediction } from '../../data/models.js';
import { authenticateScopedReportToken } from '../../auth/scoped-report-middleware.js';
import type { CoreApiDependencies } from '../api-types.js';
import { writeAudit } from '../audit.js';
import { cursorCondition, decodeCursor, encodeCursor, pageLimit } from '../cursor.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { reportExplanation, screeningDisclaimer } from '../report-text.js';
import { parseConsentScope } from '../scope.js';
import { bearerRoute } from './auth.js';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export function registerDoctorRoutes(app: Express, dependencies: CoreApiDependencies): void {
  const doctorAuth = bearerRoute(dependencies.accessTokens, 'doctor');

  app.get('/api/v1/doctor/shared-patients', ...doctorAuth, async (request, response, next) => {
    try {
      const now = new Date();
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await Consent.find({
        doctorId: objectId(request.authPrincipal!.userId),
        revoked: false,
        expiresAt: { $gt: now },
        ...cursorCondition('createdAt', cursor),
      }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      const items = await Promise.all(pageRows.map(async (consent) => {
        const item: { patientId: string; predictionId: string; consentExpiresAt: string; sharedAt: string; riskBand?: string } = {
          patientId: consent.patientId.toString(),
          predictionId: consent.predictionId.toString(),
          consentExpiresAt: consent.expiresAt.toISOString(),
          sharedAt: consent.createdAt.toISOString(),
        };
        if (parseConsentScope(consent.scope).has('riskBand')) {
          const prediction = await Prediction.findOne({ _id: consent.predictionId, patientId: consent.patientId }).select({ riskBand: 1 }).exec();
          if (prediction) item.riskBand = prediction.riskBand;
        }
        return item;
      }));
      response.status(200).json({
        items,
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt, pageRows[pageRows.length - 1]!._id)
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/doctor/reports/:predictionId/access', ...doctorAuth, async (request, response, next) => {
    try {
      const now = new Date();
      const consent = await Consent.findOne({
        doctorId: objectId(request.authPrincipal!.userId),
        predictionId: request.params['predictionId'],
        revoked: false,
        expiresAt: { $gt: now },
      }).sort({ expiresAt: -1 }).exec();
      if (!consent) throw new ConflictError('No active matching report consent exists');
      const accessToken = await dependencies.scopedReportTokens.issue(
        request.authPrincipal!.userId,
        consent.patientId.toString(),
        consent.predictionId.toString(),
        300,
        now,
      );
      await writeAudit({ actorId: request.authPrincipal!.userId, patientId: consent.patientId, action: 'issue_scoped_report_token' });
      response.status(200).json({ accessToken, expiresIn: 300, purpose: 'report:read' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/doctor/reports/:predictionId', authenticateScopedReportToken(dependencies.scopedReportTokens), async (request, response, next) => {
    try {
      const scoped = request.scopedReport;
      if (!scoped || scoped.predictionId !== request.params['predictionId']) throw new ConflictError('Scoped token does not match this report');
      const now = new Date();
      const consent = await Consent.findOne({
        doctorId: objectId(scoped.doctorId),
        patientId: objectId(scoped.patientId),
        predictionId: objectId(scoped.predictionId),
        revoked: false,
        expiresAt: { $gt: now },
      }).sort({ expiresAt: -1 }).exec();
      if (!consent) throw new ConflictError('Report consent is no longer active');
      const reportData = await dependencies.reportCache!.getOrLoad(scoped.patientId, scoped.predictionId, async () => {
        const prediction = await Prediction.findOne({ _id: scoped.predictionId, patientId: scoped.patientId }).exec();
        if (!prediction) throw new NotFoundError('Report not found');
        return {
          predictionId: prediction._id.toString(), basicScore: prediction.basicScore, mlScore: prediction.mlScore,
          scoreSource: prediction.scoreSource, riskBand: prediction.riskBand, factors: prediction.factors, modelVersion: prediction.modelVersion,
          explanation: reportExplanation(prediction), disclaimer: screeningDisclaimer,
        };
      });
      const allowed = parseConsentScope(consent.scope);
      const report: Record<string, unknown> = { predictionId: reportData.predictionId, disclaimer: reportData.disclaimer };
      if (allowed.has('basicScore')) report['basicScore'] = reportData.basicScore;
      if (allowed.has('mlScore')) report['mlScore'] = reportData.mlScore;
      if (allowed.has('scoreSource')) report['scoreSource'] = reportData.scoreSource;
      if (allowed.has('riskBand')) report['riskBand'] = reportData.riskBand;
      if (allowed.has('factors')) report['factors'] = reportData.factors;
      if (allowed.has('modelVersion')) report['modelVersion'] = reportData.modelVersion;
      if (allowed.has('explanation')) report['explanation'] = reportData.explanation;
      await writeAudit({
        actorId: scoped.doctorId,
        patientId: scoped.patientId,
        action: 'view_report',
        modelVersion: reportData.modelVersion,
      });
      response.status(200).json(report);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/doctor/outcomes', ...doctorAuth, async (request, response, next) => {
    try {
      const doctorId = objectId(request.authPrincipal!.userId);
      const input = request.body as { predictionId: string; actualOutcome: string };
      const prediction = await Prediction.findById(input.predictionId).exec();
      if (!prediction) throw new NotFoundError('Prediction not found');
      const consent = await Consent.findOne({
        doctorId,
        patientId: prediction.patientId,
        predictionId: prediction._id,
        revoked: false,
        expiresAt: { $gt: new Date() },
      }).exec();
      if (!consent) throw new ConflictError('An active report consent is required to confirm this outcome');
      if (!await Patient.exists({ _id: prediction.patientId })) throw new NotFoundError('Patient profile not found');
      let outcome;
      try {
        outcome = await Outcome.create({
          predictionId: prediction._id,
          patientId: prediction.patientId,
          confirmedByDoctorId: doctorId,
          actualOutcome: input.actualOutcome,
        });
      } catch (error) {
        if (!duplicateKey(error)) throw error;
        throw new ConflictError('An outcome has already been recorded for this prediction');
      }
      await writeAudit({ actorId: doctorId, patientId: prediction.patientId, action: 'confirm_outcome', modelVersion: prediction.modelVersion });
      response.status(201).json({
        outcomeId: outcome._id.toString(), predictionId: outcome.predictionId.toString(),
        patientId: outcome.patientId.toString(), confirmedByDoctorId: outcome.confirmedByDoctorId.toString(),
        actualOutcome: outcome.actualOutcome, confirmedAt: outcome.confirmedAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/doctor/audit/:predictionId', ...doctorAuth, async (request, response, next) => {
    try {
      const prediction = await Prediction.findById(request.params['predictionId']).exec();
      if (!prediction) throw new NotFoundError('Prediction not found');
      const consent = await Consent.exists({
        doctorId: objectId(request.authPrincipal!.userId), patientId: prediction.patientId,
        predictionId: prediction._id, revoked: false, expiresAt: { $gt: new Date() },
      });
      if (!consent) throw new ConflictError('An active report consent is required');
      const rows = await AuditLog.find({ patientId: prediction.patientId, action: 'view_report' })
        .sort({ timestamp: -1, _id: -1 }).limit(25).exec();
      response.status(200).json({ items: rows.map((entry) => ({
        auditLogId: entry._id.toString(), actorId: entry.actorId.toString(), patientId: entry.patientId.toString(),
        action: entry.action, modelVersion: entry.modelVersion ?? null, timestamp: entry.timestamp.toISOString(),
      })), nextCursor: null });
    } catch (error) {
      next(error);
    }
  });
}
