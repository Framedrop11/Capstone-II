import mongoose, { type InferSchemaType } from 'mongoose';

const Schema = mongoose.Schema;
const models = mongoose.models;

const objectId = Schema.Types.ObjectId;
const timestamps = { timestamps: true, versionKey: false } as const;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  authProvider: { type: String, required: true, trim: true, maxlength: 255 },
  role: { type: String, required: true, enum: ['patient', 'doctor', 'admin'] },
}, timestamps);
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({ authProvider: 1 }, { unique: true, name: 'users_auth_provider_unique' });

const patientSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, unique: true },
}, timestamps);
patientSchema.index({ createdAt: -1, _id: -1 }, { name: 'patients_created_cursor' });

const consentSchema = new Schema({
  patientId: { type: objectId, ref: 'Patient', required: true },
  doctorId: { type: objectId, ref: 'User', required: true },
  predictionId: { type: objectId, ref: 'Prediction', required: true },
  scope: { type: String, required: true, trim: true, maxlength: 500 },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, required: true, default: false },
  revokedAt: { type: Date, default: null },
}, timestamps);
consentSchema.index({ patientId: 1, doctorId: 1, revoked: 1, expiresAt: 1 }, { name: 'consents_patient_doctor_active' });
consentSchema.index({ doctorId: 1, revoked: 1, expiresAt: 1, _id: 1 }, { name: 'consents_doctor_worklist_cursor' });
consentSchema.index({ patientId: 1, _id: -1 }, { name: 'consents_patient_cursor' });

const questionnaireSchema = new Schema({
  patientId: { type: objectId, ref: 'Patient', required: true },
  responses: { type: Schema.Types.Mixed, required: true, validate: {
    validator: (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value),
    message: 'responses must be a JSON object',
  } },
  idempotencyKey: { type: String, trim: true, maxlength: 128 },
  submittedAt: { type: Date, required: true, default: Date.now },
}, { ...timestamps, collection: 'questionnaires' });
questionnaireSchema.index({ patientId: 1, submittedAt: -1, _id: -1 }, { name: 'questionnaires_patient_cursor' });
questionnaireSchema.index({ patientId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'questionnaires_patient_idempotency' });

const predictionSchema = new Schema({
  patientId: { type: objectId, ref: 'Patient', required: true },
  questionnaireId: { type: objectId, ref: 'Questionnaire', required: true },
  basicScore: { type: Number, required: true, min: 0, max: 1 },
  mlScore: { type: Number, default: null, min: 0, max: 1 },
  scoreSource: { type: String, required: true, enum: ['basic_only', 'ml_refined'] },
  modelVersion: { type: String, required: true, trim: true, maxlength: 100 },
  factors: { type: [String], default: [] },
  predictionTimestamp: { type: Date, required: true, default: Date.now },
}, timestamps);
predictionSchema.index({ patientId: 1, predictionTimestamp: -1, _id: -1 }, { name: 'predictions_patient_cursor' });
predictionSchema.index({ questionnaireId: 1, predictionTimestamp: -1 }, { name: 'predictions_questionnaire_history' });

const outcomeSchema = new Schema({
  predictionId: { type: objectId, ref: 'Prediction', required: true },
  patientId: { type: objectId, ref: 'Patient', required: true },
  confirmedByDoctorId: { type: objectId, ref: 'User', required: true },
  actualOutcome: { type: String, required: true, trim: true, maxlength: 200 },
  confirmedAt: { type: Date, required: true, default: Date.now },
}, timestamps);
outcomeSchema.index({ predictionId: 1 }, { unique: true, name: 'outcomes_prediction_unique' });
outcomeSchema.index({ confirmedAt: -1, _id: -1 }, { name: 'outcomes_training_cursor' });

const auditLogSchema = new Schema({
  actorId: { type: objectId, required: true },
  patientId: { type: objectId, ref: 'Patient', required: true },
  action: { type: String, required: true, trim: true, maxlength: 100 },
  modelVersion: { type: String, default: null, maxlength: 100 },
  details: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, required: true, default: Date.now },
}, { ...timestamps, collection: 'auditLogs' });
auditLogSchema.index({ patientId: 1, timestamp: -1, _id: -1 }, { name: 'audit_patient_cursor' });
auditLogSchema.index({ actorId: 1, timestamp: -1, _id: -1 }, { name: 'audit_actor_cursor' });
auditLogSchema.index({ action: 1, timestamp: -1, _id: -1 }, { name: 'audit_action_cursor' });

const modelVersionSchema = new Schema({
  version: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  status: { type: String, required: true, enum: ['candidate', 'canary', 'stable', 'retired'] },
  canaryTrafficPercent: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
  testResults: { type: Schema.Types.Mixed, required: true, default: {} },
  artifactUri: { type: String, required: true, trim: true, maxlength: 2048 },
  promotedAt: { type: Date, default: null },
}, timestamps);
modelVersionSchema.index({ status: 1, createdAt: -1, _id: -1 }, { name: 'model_versions_status_cursor' });

const notificationSchema = new Schema({
  recipientId: { type: objectId, ref: 'User', required: true },
  patientId: { type: objectId, ref: 'Patient', required: true },
  kind: { type: String, required: true, enum: ['report_ready', 'report_shared'], maxlength: 100 },
  payload: { type: Schema.Types.Mixed, required: true, default: {} },
  readAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
}, timestamps);
notificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 }, { name: 'notifications_recipient_cursor' });

const refreshTokenSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true, maxlength: 128 },
  familyId: { type: String, required: true, maxlength: 128 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedByTokenHash: { type: String, default: null, maxlength: 128 },
}, timestamps);
refreshTokenSchema.index({ userId: 1, expiresAt: 1 }, { name: 'refresh_tokens_user_expiry' });
refreshTokenSchema.index({ familyId: 1, revokedAt: 1 }, { name: 'refresh_tokens_family_revocation' });

export type UserDocument = InferSchemaType<typeof userSchema>;
export type PatientDocument = InferSchemaType<typeof patientSchema>;
export type ConsentDocument = InferSchemaType<typeof consentSchema>;
export type QuestionnaireDocument = InferSchemaType<typeof questionnaireSchema>;
export type PredictionDocument = InferSchemaType<typeof predictionSchema>;
export type OutcomeDocument = InferSchemaType<typeof outcomeSchema>;
export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export type ModelVersionDocument = InferSchemaType<typeof modelVersionSchema>;
export type NotificationDocument = InferSchemaType<typeof notificationSchema>;
export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema>;

export const User = models['User'] ?? mongoose.model('User', userSchema, 'users');
export const Patient = models['Patient'] ?? mongoose.model('Patient', patientSchema, 'patients');
export const Consent = models['Consent'] ?? mongoose.model('Consent', consentSchema, 'consents');
export const Questionnaire = models['Questionnaire'] ?? mongoose.model('Questionnaire', questionnaireSchema, 'questionnaires');
export const Prediction = models['Prediction'] ?? mongoose.model('Prediction', predictionSchema, 'predictions');
export const Outcome = models['Outcome'] ?? mongoose.model('Outcome', outcomeSchema, 'outcomes');
export const AuditLog = models['AuditLog'] ?? mongoose.model('AuditLog', auditLogSchema, 'auditLogs');
export const ModelVersion = models['ModelVersion'] ?? mongoose.model('ModelVersion', modelVersionSchema, 'modelVersions');
export const Notification = models['Notification'] ?? mongoose.model('Notification', notificationSchema, 'notifications');
export const RefreshToken = models['RefreshToken'] ?? mongoose.model('RefreshToken', refreshTokenSchema, 'refreshTokens');
