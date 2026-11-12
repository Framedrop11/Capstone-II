const appRole = 'carelensApplication';
const appUser = process.env.MONGODB_APP_USER;
const appPassword = process.env.MONGODB_APP_PASSWORD;

const specifications = {
  users: {
    required: ['name', 'email', 'authProvider', 'role', 'createdAt', 'updatedAt'],
    properties: {
      name: { bsonType: 'string', minLength: 1, maxLength: 120 },
      email: { bsonType: 'string', minLength: 3, maxLength: 254 },
      authProvider: { bsonType: 'string', minLength: 1, maxLength: 255 },
      role: { enum: ['patient', 'doctor', 'admin'] },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  patients: {
    required: ['userId', 'createdAt', 'updatedAt'],
    properties: { userId: { bsonType: 'objectId' }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' } },
  },
  consents: {
    required: ['patientId', 'doctorId', 'predictionId', 'scope', 'expiresAt', 'revoked', 'createdAt', 'updatedAt'],
    properties: {
      patientId: { bsonType: 'objectId' }, doctorId: { bsonType: 'objectId' }, predictionId: { bsonType: 'objectId' },
      scope: { bsonType: 'string', minLength: 1, maxLength: 500 }, expiresAt: { bsonType: 'date' }, revoked: { bsonType: 'bool' },
      revokedAt: { bsonType: ['date', 'null'] }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  questionnaires: {
    required: ['patientId', 'responses', 'submittedAt', 'createdAt', 'updatedAt'],
    properties: {
      patientId: { bsonType: 'objectId' }, responses: { bsonType: 'object' }, submittedAt: { bsonType: 'date' },
      idempotencyKey: { bsonType: 'string', maxLength: 128 }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  predictions: {
    required: ['patientId', 'questionnaireId', 'basicScore', 'mlScore', 'scoreSource', 'modelVersion', 'predictionTimestamp', 'createdAt', 'updatedAt'],
    properties: {
      patientId: { bsonType: 'objectId' }, questionnaireId: { bsonType: 'objectId' },
      basicScore: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0, maximum: 1 },
      mlScore: { bsonType: ['double', 'int', 'long', 'decimal', 'null'], minimum: 0, maximum: 1 },
      scoreSource: { enum: ['basic_only', 'ml_refined'] }, modelVersion: { bsonType: 'string', minLength: 1, maxLength: 100 },
      factors: { bsonType: 'array', items: { bsonType: 'string' } }, predictionTimestamp: { bsonType: 'date' },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  outcomes: {
    required: ['predictionId', 'patientId', 'confirmedByDoctorId', 'actualOutcome', 'confirmedAt', 'createdAt', 'updatedAt'],
    properties: {
      predictionId: { bsonType: 'objectId' }, patientId: { bsonType: 'objectId' }, confirmedByDoctorId: { bsonType: 'objectId' },
      actualOutcome: { bsonType: 'string', minLength: 1, maxLength: 200 }, confirmedAt: { bsonType: 'date' },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  auditLogs: {
    required: ['actorId', 'patientId', 'action', 'timestamp', 'createdAt', 'updatedAt'],
    properties: {
      actorId: { bsonType: 'objectId' }, patientId: { bsonType: 'objectId' }, action: { bsonType: 'string', minLength: 1, maxLength: 100 },
      modelVersion: { bsonType: ['string', 'null'], maxLength: 100 }, timestamp: { bsonType: 'date' },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  modelVersions: {
    required: ['version', 'status', 'canaryTrafficPercent', 'testResults', 'artifactUri', 'createdAt', 'updatedAt'],
    properties: {
      version: { bsonType: 'string', minLength: 1, maxLength: 100 }, status: { enum: ['candidate', 'canary', 'stable', 'retired'] },
      canaryTrafficPercent: { bsonType: ['double', 'int', 'long'], minimum: 0, maximum: 100, multipleOf: 1 }, testResults: { bsonType: 'object' },
      artifactUri: { bsonType: 'string', minLength: 1, maxLength: 2048 }, promotedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  notifications: {
    required: ['recipientId', 'patientId', 'kind', 'payload', 'createdAt', 'updatedAt'],
    properties: {
      recipientId: { bsonType: 'objectId' }, patientId: { bsonType: 'objectId' },
      kind: { enum: ['report_ready', 'report_shared'] }, payload: { bsonType: 'object' },
      readAt: { bsonType: ['date', 'null'] }, deliveredAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
  refreshTokens: {
    required: ['userId', 'tokenHash', 'familyId', 'expiresAt', 'createdAt', 'updatedAt'],
    properties: {
      userId: { bsonType: 'objectId' }, tokenHash: { bsonType: 'string', minLength: 1, maxLength: 128 },
      familyId: { bsonType: 'string', minLength: 1, maxLength: 128 }, expiresAt: { bsonType: 'date' },
      revokedAt: { bsonType: ['date', 'null'] }, replacedByTokenHash: { bsonType: ['string', 'null'], maxLength: 128 },
      createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' },
    },
  },
};

const indexes = {
  users: [
    { key: { email: 1 }, name: 'users_email_unique', unique: true },
    { key: { authProvider: 1 }, name: 'users_auth_provider_unique', unique: true },
  ],
  patients: [
    { key: { userId: 1 }, name: 'patients_user_unique', unique: true },
    { key: { createdAt: -1, _id: -1 }, name: 'patients_created_cursor' },
  ],
  consents: [
    { key: { patientId: 1, doctorId: 1, revoked: 1, expiresAt: 1 }, name: 'consents_patient_doctor_active' },
    { key: { doctorId: 1, revoked: 1, expiresAt: 1, _id: 1 }, name: 'consents_doctor_worklist_cursor' },
    { key: { patientId: 1, _id: -1 }, name: 'consents_patient_cursor' },
  ],
  questionnaires: [
    { key: { patientId: 1, submittedAt: -1, _id: -1 }, name: 'questionnaires_patient_cursor' },
    { key: { patientId: 1, idempotencyKey: 1 }, name: 'questionnaires_patient_idempotency', unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
  ],
  predictions: [
    { key: { patientId: 1, predictionTimestamp: -1, _id: -1 }, name: 'predictions_patient_cursor' },
    { key: { questionnaireId: 1, predictionTimestamp: -1 }, name: 'predictions_questionnaire_history' },
  ],
  outcomes: [
    { key: { predictionId: 1 }, name: 'outcomes_prediction_unique', unique: true },
    { key: { confirmedAt: -1, _id: -1 }, name: 'outcomes_training_cursor' },
  ],
  auditLogs: [
    { key: { patientId: 1, timestamp: -1, _id: -1 }, name: 'audit_patient_cursor' },
    { key: { actorId: 1, timestamp: -1, _id: -1 }, name: 'audit_actor_cursor' },
    { key: { action: 1, timestamp: -1, _id: -1 }, name: 'audit_action_cursor' },
  ],
  modelVersions: [
    { key: { version: 1 }, name: 'model_versions_version_unique', unique: true },
    { key: { status: 1, createdAt: -1, _id: -1 }, name: 'model_versions_status_cursor' },
  ],
  notifications: [
    { key: { recipientId: 1, createdAt: -1, _id: -1 }, name: 'notifications_recipient_cursor' },
  ],
  refreshTokens: [
    { key: { tokenHash: 1 }, name: 'refresh_tokens_hash_unique', unique: true },
    { key: { userId: 1, expiresAt: 1 }, name: 'refresh_tokens_user_expiry' },
    { key: { familyId: 1, revokedAt: 1 }, name: 'refresh_tokens_family_revocation' },
  ],
};

const collectionNames = Object.keys(specifications);
const appActions = ['find', 'insert', 'update', 'remove'];

export async function up(db) {
  if (!appUser || !appPassword) {
    throw new Error('MONGODB_APP_USER and MONGODB_APP_PASSWORD are required to provision the restricted application account');
  }

  for (const name of collectionNames) {
    const validator = { $jsonSchema: { bsonType: 'object', required: specifications[name].required, properties: specifications[name].properties } };
    const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext();
    if (exists) {
      await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
    await db.collection(name).createIndexes(indexes[name]);
  }

  const privileges = collectionNames.map((collection) => ({
    resource: { db: db.databaseName, collection },
    actions: collection === 'auditLogs' ? ['find', 'insert'] : appActions,
  }));
  try {
    await db.command({ createRole: appRole, privileges, roles: [] });
  } catch (error) {
    if (error.codeName !== 'RoleAlreadyExists') throw error;
    await db.command({ updateRole: appRole, privileges, roles: [] });
  }

  try {
    await db.command({ createUser: appUser, pwd: appPassword, roles: [appRole] });
  } catch (error) {
    if (error.codeName !== 'DuplicateKey' && error.codeName !== 'UserAlreadyExists') throw error;
    await db.command({ updateUser: appUser, pwd: appPassword, roles: [appRole] });
  }
}

export async function down(db) {
  if (appUser) {
    try { await db.command({ dropUser: appUser }); } catch (error) { if (error.codeName !== 'UserNotFound') throw error; }
  }
  try { await db.command({ dropRole: appRole }); } catch (error) { if (error.codeName !== 'RoleNotFound') throw error; }
  // Collections and data are intentionally retained; rollback must never erase patient records.
}
