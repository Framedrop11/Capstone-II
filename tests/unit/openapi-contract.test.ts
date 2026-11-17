import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

test('OpenAPI 3.1 contract declares the Stage 3 API and operations endpoints', async () => {
  const source = await readFile(resolve(process.cwd(), 'services/core-api/openapi/openapi.yaml'), 'utf8');
  const document = parse(source) as { openapi?: string; paths?: Record<string, Record<string, unknown>> };
  assert.equal(document.openapi, '3.1.0');
  const paths = document.paths ?? {};
  const login = paths['/api/v1/auth/login']?.['get'] as { parameters?: Array<{ name?: string }> } | undefined;
  assert.ok(login?.parameters?.some((parameter) => parameter.name === 'mock_role'));
  for (const path of [
    '/api/v1/auth/login', '/api/v1/auth/callback', '/api/v1/auth/refresh', '/api/v1/auth/logout',
    '/api/v1/patient/questionnaires', '/api/v1/patient/questionnaires/{questionnaireId}', '/api/v1/patient/predictions', '/api/v1/patient/doctors', '/api/v1/patient/notifications', '/api/v1/patient/notifications/{notificationId}/read', '/api/v1/patient/reports/{predictionId}',
    '/api/v1/patient/consents', '/api/v1/patient/consents/{consentId}/revoke', '/api/v1/patient/audit',
    '/api/v1/doctor/shared-patients', '/api/v1/doctor/reports/{predictionId}/access',
    '/api/v1/doctor/reports/{predictionId}', '/api/v1/doctor/outcomes', '/healthz', '/readyz', '/metrics',
  ]) assert.ok(paths[path], `missing path ${path}`);
  assert.ok(paths['/api/v1/admin/users']);
  assert.ok(paths['/api/v1/admin/model-versions/{version}/promote']);
});
