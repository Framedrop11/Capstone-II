import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuditLog,
  Consent,
  ModelVersion,
  Notification,
  Outcome,
  Patient,
  Prediction,
  Questionnaire,
  RefreshToken,
  User,
} from '../../services/core-api/src/data/models.js';

const id = '65a000000000000000000001';

test('registers all ten collections with explicit collection names', () => {
  assert.deepEqual(
    [User, Patient, Consent, Questionnaire, Prediction, Outcome, AuditLog, ModelVersion, Notification, RefreshToken]
      .map((entry) => entry.collection.collectionName),
    ['users', 'patients', 'consents', 'questionnaires', 'predictions', 'outcomes', 'auditLogs', 'modelVersions', 'notifications', 'refreshTokens'],
  );
});

test('normalizes user email and rejects an invalid role', async () => {
  const user = new User({ name: 'Patient One', email: ' PERSON@EXAMPLE.COM ', authProvider: 'google|sub', role: 'patient' });
  await user.validate();
  assert.equal(user.email, 'person@example.com');
  const invalidUser = new User({ name: 'Patient One', email: 'p@example.com', authProvider: 'google|sub', role: 'owner' });
  await assert.rejects(invalidUser.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
});

test('requires consent scope and expiry', async () => {
  const consent = new Consent({ patientId: id, doctorId: id });
  await assert.rejects(consent.validate(), (error: unknown) => {
    assert.ok(error instanceof Error && error.name === 'ValidationError');
    assert.match(error.message, /scope/);
    assert.match(error.message, /expiresAt/);
    return true;
  });
});

test('requires questionnaire response object and patient reference', async () => {
  const questionnaire = new Questionnaire({ patientId: id, responses: [] });
  await assert.rejects(questionnaire.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
  const valid = new Questionnaire({ patientId: id, responses: { age: 42 } });
  await valid.validate();
});

test('enforces score bounds and score source enum', async () => {
  const prediction = new Prediction({
    patientId: id, questionnaireId: id, basicScore: 1.2, mlScore: null,
    scoreSource: 'basic_only', modelVersion: 'rules-v1',
  });
  await assert.rejects(prediction.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
  const invalidSource = new Prediction({
    patientId: id, questionnaireId: id, basicScore: 0.4, mlScore: 0.7,
    scoreSource: 'manual', modelVersion: 'ml-v1',
  });
  await assert.rejects(invalidSource.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
});

test('requires outcome attribution and constrains model rollout percentage', async () => {
  const outcome = new Outcome({ predictionId: id, patientId: id, actualOutcome: 'confirmed' });
  await assert.rejects(outcome.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
  const version = new ModelVersion({
    version: 'model-v1', status: 'stable', canaryTrafficPercent: 101,
    testResults: {}, artifactUri: 'registry://model-v1',
  });
  await assert.rejects(version.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
});

test('declares compound indexes for consent, audit, and cursor paths', () => {
  const consentIndexes = Consent.schema.indexes().map(([keys]) => Object.keys(keys).join(','));
  const auditIndexes = AuditLog.schema.indexes().map(([keys]) => Object.keys(keys).join(','));
  const questionnaireIndexes = Questionnaire.schema.indexes().map(([keys]) => Object.keys(keys).join(','));
  assert.ok(consentIndexes.includes('patientId,doctorId,revoked,expiresAt'));
  assert.ok(auditIndexes.includes('patientId,timestamp,_id'));
  assert.ok(questionnaireIndexes.includes('patientId,submittedAt,_id'));
});

test('notification and refresh token models require recipient and family fields', async () => {
  const notification = new Notification({ patientId: id, kind: 'report_ready', payload: {} });
  await assert.rejects(notification.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
  const refreshToken = new RefreshToken({ userId: id, tokenHash: 'hash' });
  await assert.rejects(refreshToken.validate(), (error: unknown) => error instanceof Error && error.name === 'ValidationError');
});
