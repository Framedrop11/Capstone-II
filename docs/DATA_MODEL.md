# Data model and migration operations

Stage 1 defines ten MongoDB collections with matching Mongoose models and collection-level MongoDB `$jsonSchema` validators. JSON and BSON field names use camelCase. Mongoose auto-index creation is disabled; migrations own production index creation.

| Collection | Main constraints and indexes |
|---|---|
| `users` | Required identity/provider/role; unique normalized email and provider subject |
| `patients` | One patient profile per user (`userId` unique); stable creation cursor |
| `consents` | Patient, doctor, prediction, scope, expiry and revocation fields; patient/doctor active-consent and doctor worklist indexes |
| `questionnaires` | Patient and object-shaped responses; per-patient idempotency key and submission cursor |
| `predictions` | Scores bounded to 0–1; nullable ML score; source enum; patient and questionnaire history indexes |
| `outcomes` | Required prediction, patient, doctor and outcome; one current outcome per prediction |
| `auditLogs` | Required actor, patient, action and timestamp; patient, actor and action cursor indexes |
| `modelVersions` | Unique version, lifecycle enum and integer canary percentage from 0–100 |
| `notifications` | Recipient, patient, kind and payload; recipient cursor |
| `refreshTokens` | Unique token hash, family and expiry/revocation metadata; user and family indexes |

Patient records use `patients._id`; `patients.userId` references `users._id`. MongoDB does not enforce foreign keys, so services must verify referenced records and ownership before writes. No TTL index is used for questionnaire, prediction, outcome or audit history; cleanup policies must preserve the SRS retention period.

## Migration credentials

Set `MONGODB_MIGRATION_URI` to a migration/admin connection, `MONGODB_DATABASE` to the target database, and `MONGODB_APP_USER` / `MONGODB_APP_PASSWORD` for the runtime identity. Run `npm run db:migrate`. The migration creates validators, indexes, a `carelensApplication` role, and the app user. That role permits find/insert/update/remove on application collections but only find/insert on `auditLogs`. Run `npm run db:rollback` to remove the app user and role; rollback deliberately retains collections and patient data.

Example values only (never use these credentials outside local development):

```text
MONGODB_MIGRATION_URI=mongodb://migration_user:replace-me@localhost:27017/?authSource=admin
MONGODB_DATABASE=carelens
MONGODB_APP_USER=carelens_app
MONGODB_APP_PASSWORD=replace-me
```

Migration execution needs a MongoDB replica-set deployment and a migration identity allowed to manage collections, roles and users. The runtime application identity must not receive cluster-wide privileges.
