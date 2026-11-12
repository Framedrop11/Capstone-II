import type { Express } from 'express';
import { Types } from 'mongoose';
import {
  AuditLog,
  Consent,
  Notification,
  Patient,
  Prediction,
  Questionnaire,
  User,
} from '../../data/models.js';
import type { CoreApiDependencies } from '../api-types.js';
import { writeAudit } from '../audit.js';
import { cursorCondition, decodeCursor, encodeCursor, pageLimit } from '../cursor.js';
import { BadRequestError, ConflictError, NotFoundError } from '../errors.js';
import { reportExplanation, screeningDisclaimer } from '../report-text.js';
import { parseConsentScope } from '../scope.js';
import { bearerRoute } from './auth.js';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function serializeConsent(consent: InstanceType<typeof Consent>): Record<string, unknown> {
  return {
    consentId: consent._id.toString(),
    patientId: consent.patientId.toString(),
    doctorId: consent.doctorId.toString(),
    predictionId: consent.predictionId.toString(),
    scope: consent.scope,
    expiresAt: consent.expiresAt.toISOString(),
    revoked: consent.revoked,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export function registerPatientRoutes(app: Express, dependencies: CoreApiDependencies): void {
  const auth = bearerRoute(dependencies.accessTokens, 'patient');

  app.post('/api/v1/patient/questionnaires', ...auth, async (request, response, next) => {
    try {
      const userId = request.authPrincipal?.userId;
      const idempotencyKey = request.get('Idempotency-Key');
      if (!userId || !idempotencyKey) throw new BadRequestError('Idempotency-Key is required');
      const patient = await Patient.findOne({ userId: objectId(userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const responses = (request.body as { responses: Record<string, unknown> }).responses;
      let questionnaire = await Questionnaire.findOne({ patientId: patient._id, idempotencyKey }).exec();
      if (questionnaire && stableStringify(questionnaire.responses) !== stableStringify(responses)) {
        throw new ConflictError('Idempotency-Key was already used with a different questionnaire');
      }
      if (!questionnaire) {
        try {
          questionnaire = await Questionnaire.create({ patientId: patient._id, responses, idempotencyKey });
        } catch (error) {
          if (!duplicateKey(error)) throw error;
          questionnaire = await Questionnaire.findOne({ patientId: patient._id, idempotencyKey }).exec();
          if (!questionnaire || stableStringify(questionnaire.responses) !== stableStringify(responses)) {
            throw new ConflictError('Idempotency-Key was already used with a different questionnaire');
          }
        }
      }
      const correlationId = request.correlationId;
      if (!correlationId) throw new Error('Request correlation ID was not initialized');
      await dependencies.scoringQueue.enqueue({
        questionnaireId: questionnaire._id.toString(),
        patientId: patient._id.toString(),
        correlationId,
      });
      response.status(202).json({
        questionnaireId: questionnaire._id.toString(),
        status: 'pending',
        submittedAt: questionnaire.submittedAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/patient/predictions', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const filter = { patientId: patient._id, ...cursorCondition('predictionTimestamp', cursor) };
      const rows = await Prediction.find(filter).sort({ predictionTimestamp: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      response.status(200).json({
        items: pageRows.map((prediction) => ({
          predictionId: prediction._id.toString(),
          questionnaireId: prediction.questionnaireId.toString(),
          status: 'complete',
          basicScore: prediction.basicScore,
          mlScore: prediction.mlScore,
          scoreSource: prediction.scoreSource,
          modelVersion: prediction.modelVersion,
          predictionTimestamp: prediction.predictionTimestamp.toISOString(),
        })),
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!.predictionTimestamp, pageRows[pageRows.length - 1]!._id)
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/patient/reports/:predictionId', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const prediction = await Prediction.findOne({ _id: request.params['predictionId'], patientId: patient._id }).exec();
      if (!prediction) throw new NotFoundError('Report not found');
      await writeAudit({
        actorId: request.authPrincipal!.userId,
        patientId: patient._id,
        action: 'view_report',
        modelVersion: prediction.modelVersion,
      });
      response.status(200).json({
        predictionId: prediction._id.toString(),
        basicScore: prediction.basicScore,
        mlScore: prediction.mlScore,
        scoreSource: prediction.scoreSource,
        modelVersion: prediction.modelVersion,
        explanation: reportExplanation(prediction),
        disclaimer: screeningDisclaimer,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/patient/consents', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await Consent.find({ patientId: patient._id, ...cursorCondition('createdAt', cursor) })
        .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      response.status(200).json({
        items: pageRows.map(serializeConsent),
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt, pageRows[pageRows.length - 1]!._id)
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/patient/consents', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const input = request.body as { doctorId: string; predictionId: string; scope: string; expiresAt: string };
      const doctor = await User.findOne({ _id: input.doctorId, role: 'doctor' }).exec();
      if (!doctor) throw new NotFoundError('Doctor account not found');
      const prediction = await Prediction.findOne({ _id: input.predictionId, patientId: patient._id }).exec();
      if (!prediction) throw new NotFoundError('Patient report not found');
      parseConsentScope(input.scope);
      const expiresAt = new Date(input.expiresAt);
      if (expiresAt.getTime() <= Date.now()) throw new BadRequestError('Consent expiry must be in the future');
      const consent = await Consent.create({
        patientId: patient._id,
        doctorId: doctor._id,
        predictionId: prediction._id,
        scope: input.scope,
        expiresAt,
        revoked: false,
      });
      await Notification.create({
        recipientId: doctor._id,
        patientId: patient._id,
        kind: 'report_shared',
        payload: { predictionId: prediction._id.toString(), consentId: consent._id.toString() },
      });
      await writeAudit({ actorId: request.authPrincipal!.userId, patientId: patient._id, action: 'grant_consent' });
      response.status(201).json(serializeConsent(consent));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/v1/patient/consents/:consentId/revoke', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const consent = await Consent.findOneAndUpdate(
        { _id: request.params['consentId'], patientId: patient._id, revoked: false },
        { $set: { revoked: true, revokedAt: new Date() } },
        { new: true, runValidators: true },
      ).exec();
      if (!consent) throw new NotFoundError('Active consent not found');
      await writeAudit({ actorId: request.authPrincipal!.userId, patientId: patient._id, action: 'revoke_consent' });
      response.status(200).json(serializeConsent(consent));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/patient/audit', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const rows = await AuditLog.find({ patientId: patient._id, ...cursorCondition('timestamp', cursor) })
        .sort({ timestamp: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      response.status(200).json({
        items: pageRows.map((entry) => ({
          auditLogId: entry._id.toString(), actorId: entry.actorId.toString(), patientId: entry.patientId.toString(),
          action: entry.action, modelVersion: entry.modelVersion ?? null, timestamp: entry.timestamp.toISOString(),
        })),
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!.timestamp, pageRows[pageRows.length - 1]!._id)
          : null,
      });
    } catch (error) {
      next(error);
    }
  });
}
