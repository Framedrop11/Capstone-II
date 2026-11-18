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
import { writeLog } from '../../../../../packages/shared/src/index.js';

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function serializeConsent(consent: InstanceType<typeof Consent>, knownDoctorName?: string): Record<string, unknown> {
  const doctor = consent.doctorId as unknown as { _id?: Types.ObjectId; name?: string };
  return {
    consentId: consent._id.toString(),
    patientId: consent.patientId.toString(),
    doctorId: (doctor._id ?? consent.doctorId).toString(),
    doctorName: knownDoctorName ?? doctor.name ?? 'Doctor',
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

  app.get('/api/v1/patient/doctors', ...auth, async (request, response, next) => {
    try {
      const query = typeof request.query['query'] === 'string' ? request.query['query'].trim().slice(0, 80) : '';
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const doctors = await User.find({ role: 'doctor', ...(escaped ? { name: { $regex: escaped, $options: 'i' } } : {}) })
        .sort({ name: 1, _id: 1 }).limit(pageLimit(request.query['limit'])).select({ name: 1 }).lean().exec();
      response.status(200).json({ items: doctors.map((doctor) => ({ doctorId: doctor._id.toString(), name: doctor.name })) });
    } catch (error) { next(error); }
  });

  app.get('/api/v1/patient/questionnaires/:questionnaireId', ...auth, async (request, response, next) => {
    try {
      const patient = await Patient.findOne({ userId: objectId(request.authPrincipal!.userId) }).exec();
      if (!patient) throw new NotFoundError('Patient profile not found');
      const questionnaireId = request.params['questionnaireId'];
      if (typeof questionnaireId !== 'string' || !Types.ObjectId.isValid(questionnaireId)) throw new BadRequestError('Questionnaire identifier is invalid');
      const questionnaire = await Questionnaire.findOne({ _id: questionnaireId, patientId: patient._id }).select({ _id: 1, submittedAt: 1 }).exec();
      if (!questionnaire) throw new NotFoundError('Questionnaire not found');
      const prediction = await Prediction.findOne({ questionnaireId: questionnaire._id, patientId: patient._id }).select({ _id: 1, scoreSource: 1 }).exec();
      const queueStatus = prediction ? 'complete' : await dependencies.scoringQueue.getStatus?.(questionnaireId) ?? 'pending';
      const status = prediction ? 'complete' : queueStatus === 'failed' || queueStatus === 'missing' ? 'failed' : 'pending';
      response.status(200).json({ questionnaireId, status, submittedAt: questionnaire.submittedAt.toISOString(), ...(prediction ? { predictionId: prediction._id.toString(), scoreSource: prediction.scoreSource } : {}) });
    } catch (error) { next(error); }
  });

  app.get('/api/v1/patient/notifications', ...auth, async (request, response, next) => {
    try {
      const userId = objectId(request.authPrincipal!.userId);
      const limit = pageLimit(request.query['limit']);
      const cursor = decodeCursor(typeof request.query['cursor'] === 'string' ? request.query['cursor'] : undefined);
      const filter = { recipientId: userId, ...cursorCondition('createdAt', cursor) };
      const [rows, unreadCount] = await Promise.all([
        Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec(),
        Notification.countDocuments({ recipientId: userId, readAt: null }).exec(),
      ]);
      const pageRows = rows.slice(0, limit);
      response.status(200).json({
        items: pageRows.map((item) => ({ notificationId: item._id.toString(), kind: item.kind, createdAt: item.createdAt.toISOString(), readAt: item.readAt?.toISOString() ?? null, ...(item.kind === 'report_ready' ? { predictionId: item.payload['predictionId'] } : {}) })),
        unreadCount,
        nextCursor: rows.length > limit && pageRows.length ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt, pageRows[pageRows.length - 1]!._id) : null,
      });
    } catch (error) { next(error); }
  });

  app.post('/api/v1/patient/notifications/:notificationId/read', ...auth, async (request, response, next) => {
    try {
      const notificationId = request.params['notificationId'];
      if (typeof notificationId !== 'string' || !Types.ObjectId.isValid(notificationId)) throw new BadRequestError('Notification identifier is invalid');
      const item = await Notification.findOneAndUpdate({ _id: notificationId, recipientId: objectId(request.authPrincipal!.userId) }, { $set: { readAt: new Date() } }, { new: true }).exec();
      if (!item) throw new NotFoundError('Notification not found');
      response.status(200).json({ notificationId: item._id.toString(), readAt: item.readAt?.toISOString() ?? null });
    } catch (error) { next(error); }
  });

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
      const predictionParam = request.params['predictionId'];
      if (typeof predictionParam !== 'string') throw new BadRequestError('Prediction identifier is invalid');
      const predictionId = predictionParam;
      const report = await dependencies.reportCache!.getOrLoad(patient._id.toString(), predictionId, async () => {
        const prediction = await Prediction.findOne({ _id: predictionId, patientId: patient._id }).exec();
        if (!prediction) throw new NotFoundError('Report not found');
        return {
          predictionId: prediction._id.toString(), basicScore: prediction.basicScore, mlScore: prediction.mlScore,
          scoreSource: prediction.scoreSource, riskBand: prediction.riskBand, factors: prediction.factors, modelVersion: prediction.modelVersion,
          explanation: reportExplanation(prediction), disclaimer: screeningDisclaimer,
        };
      });
      await writeAudit({
        actorId: request.authPrincipal!.userId,
        patientId: patient._id,
        action: 'view_report',
        modelVersion: report.modelVersion,
      });
      response.status(200).json(report);
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
      const rows = await Consent.find({ patientId: patient._id, ...cursorCondition('createdAt', cursor) }).populate('doctorId', 'name')
        .sort({ createdAt: -1, _id: -1 }).limit(limit + 1).exec();
      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);
      response.status(200).json({
        items: pageRows.map((consent) => serializeConsent(consent)),
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
      if (dependencies.emailNotifications) {
        void dependencies.emailNotifications.reportShared(doctor.email).catch((error: unknown) => {
          writeLog('warn', 'email_notification_failed', { service: 'carelens-core-api', event: 'report_shared', errorType: error instanceof Error ? error.name : 'UnknownError' });
        });
      }
      await writeAudit({ actorId: request.authPrincipal!.userId, patientId: patient._id, action: 'grant_consent' });
      response.status(201).json(serializeConsent(consent, doctor.name));
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
      const doctor = await User.findById(consent.doctorId).select({ name: 1 }).exec();
      await writeAudit({ actorId: request.authPrincipal!.userId, patientId: patient._id, action: 'revoke_consent' });
      response.status(200).json(serializeConsent(consent, doctor?.name));
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
