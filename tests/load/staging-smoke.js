import http from 'k6/http';
import { check } from 'k6';
import { sleep } from 'k6';

const baseUrl = __ENV.BASE_URL;
if (!baseUrl) throw new Error('BASE_URL is required');
const scenario = __ENV.SCENARIO || 'health';
const vuCount = Number(__ENV.VUS || (scenario === 'journey' ? 5 : 2));
const thresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1500'],
};
if (scenario === 'journey') {
  thresholds['http_req_duration{endpoint:questionnaire_submit}'] = ['p(95)<1000'];
  thresholds['http_req_duration{endpoint:report_read}'] = ['p(95)<1000'];
}

const options = { thresholds };
if (scenario === 'journey') {
  options.vus = vuCount;
  options.iterations = Number(__ENV.ITERATIONS || 10);
} else {
  options.vus = vuCount;
  options.duration = __ENV.DURATION || '30s';
}
export { options };

export function setup() {
  if (scenario !== 'journey') return {};
  const authorization = http.get(`${baseUrl}/api/v1/auth/login?response_mode=json&mock_role=patient`, { redirects: 0 });
  const cookie = (authorization.headers['Set-Cookie'] || '').split(';')[0];
  const callback = authorization.headers.Location;
  check(authorization, { 'mock OIDC login returns a callback': (response) => response.status === 302 && Boolean(response.headers.Location) });
  if (!callback || !cookie) throw new Error('Mock OIDC login did not issue the callback or transaction cookie.');
  const callbackQuery = callback.substring(callback.indexOf('?'));
  const session = http.get(`${baseUrl}/api/v1/auth/callback${callbackQuery}`, { headers: { Cookie: cookie }, tags: { endpoint: 'login_callback' } });
  const token = session.json('accessToken');
  const userId = session.json('userId');
  check(session, { 'mock OIDC callback issues a patient token': (response) => response.status === 200 && response.json('role') === 'patient' });
  if (!token || !userId) throw new Error('Mock OIDC callback did not issue a patient token.');
  return { token };
}

export default function (auth) {
  if (scenario !== 'journey') {
    for (const path of ['/healthz', '/readyz']) {
      const response = http.get(`${baseUrl}${path}`, { tags: { endpoint: path } });
      check(response, { [`${path} returns 200`]: (result) => result.status === 200 });
    }
    sleep(0.1);
    return;
  }

  const headers = { Authorization: `Bearer ${auth.token}`, 'Idempotency-Key': `k6-${__VU}-${__ITER}-${Date.now()}` };
  const submitHeaders = { Authorization: headers.Authorization, 'Idempotency-Key': headers['Idempotency-Key'], 'Content-Type': 'application/json' };
  const submitted = http.post(`${baseUrl}/api/v1/patient/questionnaires`, JSON.stringify({ responses: {
    ageYears: 40, bmi: 24, waistCm: 78, sex: 'female', activity30MinDaily: true,
    fruitVegetablesDaily: true, antihypertensiveTreatment: false, historyHighGlucose: false,
    familyHistoryDiabetes: 'none',
  } }), { headers: submitHeaders, tags: { endpoint: 'questionnaire_submit' } });
  check(submitted, { 'questionnaire accepted': (response) => response.status === 202 });
  if (submitted.status !== 202) return;
  const questionnaireId = submitted.json('questionnaireId');
  let status;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    status = http.get(`${baseUrl}/api/v1/patient/questionnaires/${questionnaireId}`, { headers, tags: { endpoint: 'questionnaire_status' } });
    if (status.json('status') === 'complete') break;
    if (status.json('status') === 'failed') break;
    sleep(0.25);
  }
  check(status, { 'questionnaire scoring completes': (response) => response && response.status === 200 && response.json('status') === 'complete' });
  const predictionId = status && status.json('predictionId');
  if (!predictionId) return;
  const report = http.get(`${baseUrl}/api/v1/patient/reports/${predictionId}`, { headers, tags: { endpoint: 'report_read' } });
  check(report, {
    'report is returned with a screening disclaimer': (response) => response.status === 200 && Boolean(response.json('disclaimer')),
    'report identifies its score source': (response) => response.status === 200 && ['basic_only', 'ml_refined'].includes(response.json('scoreSource')),
  });
  sleep(0.1);
}
