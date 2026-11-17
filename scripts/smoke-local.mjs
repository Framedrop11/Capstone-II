import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const frontend = process.env['CARELENS_SMOKE_FRONTEND'] ?? 'http://localhost:18082';
const api = process.env['CARELENS_SMOKE_API'] ?? 'http://localhost:3000';
const ml = process.env['CARELENS_SMOKE_ML'] ?? 'http://localhost:8000';
const prometheus = process.env['CARELENS_SMOKE_PROMETHEUS'] ?? 'http://localhost:9090';
const grafana = process.env['CARELENS_SMOKE_GRAFANA'] ?? 'http://localhost:3001';
const composeArgs = ['compose', '--env-file', '.env', '-f', 'infra/docker/docker-compose.yml'];
const requiredServices = new Map([
  ['mongo', 'healthy'],
  ['mongo-rs-init', 'completed'],
  ['database-migrate', 'completed'],
  ['queue-redis', 'healthy'],
  ['cache-redis', 'healthy'],
  ['ml-service', 'healthy'],
  ['core-api', 'healthy'],
  ['worker', 'healthy'],
  ['frontend', 'healthy'],
  ['prometheus', 'healthy'],
  ['grafana', 'healthy'],
]);

function log(message) {
  process.stdout.write(`PASS ${message}\n`);
}

function compose(args) {
  return execFileSync('docker', [...composeArgs, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}

async function expectOk(label, url) {
  const response = await request(url);
  assert.equal(response.status, 200, `${label} returned HTTP ${response.status}`);
  log(`${label} HTTP 200`);
  return response;
}

async function main() {
  const rows = compose(['ps', '--all', '--format', 'json'])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  for (const [service, expected] of requiredServices) {
    const container = rows.find((row) => row.Service === service);
    assert.ok(container, `Compose service ${service} has no container`);
    if (expected === 'healthy') {
      assert.equal(container.State, 'running', `${service} is not running`);
      assert.equal(container.Health, 'healthy', `${service} is not healthy`);
    } else {
      assert.equal(container.State, 'exited', `${service} did not complete`);
      assert.equal(container.ExitCode, 0, `${service} exited with ${container.ExitCode}`);
    }
    log(`Compose ${service}: ${expected}`);
  }

  await expectOk('Frontend readiness', `${frontend}/readyz`);
  await expectOk('Core API health', `${api}/healthz`);
  const readiness = await expectOk('Core API readiness', `${api}/readyz`);
  const readinessBody = await readiness.json();
  assert.equal(readinessBody.database, true);
  assert.equal(readinessBody.queue, true);

  for (const path of ['/docs', '/api/docs']) {
    const response = await expectOk(`Core API docs ${path}`, `${api}${path}`);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  }
  const proxiedDocs = await expectOk('Frontend same-origin API docs', `${frontend}/api/docs`);
  assert.match(proxiedDocs.headers.get('content-type') ?? '', /text\/html/i);
  await expectOk('ML service health', `${ml}/health`);
  await expectOk('Prometheus health', `${prometheus}/-/healthy`);
  await expectOk('Grafana health', `${grafana}/api/health`);

  const workerProbe = compose([
    'exec', '-T', 'worker', 'node', '-e',
    "fetch('http://127.0.0.1:9464/metrics').then(async r=>{if(!r.ok)process.exit(1);const t=await r.text();if(!t.includes('carelens_worker_'))process.exit(2);process.stdout.write('worker metrics ready\\n')}).catch(()=>process.exit(3))",
  ]);
  assert.match(workerProbe, /worker metrics ready/);
  log('Worker metrics readiness');

  const loginStart = await request(`${frontend}/api/v1/auth/login?mock_role=patient`, {
    redirect: 'manual',
  });
  assert.equal(loginStart.status, 302, 'Mock login did not return HTTP 302');
  const callbackUrl = loginStart.headers.get('location');
  assert.ok(callbackUrl, 'Mock login did not return a callback URL');
  const callback = new URL(callbackUrl);
  assert.equal(callback.searchParams.get('code'), 'mock-valid-code', 'The local stack is not using mock OIDC');
  const cookies = loginStart.headers.getSetCookie?.() ?? [loginStart.headers.get('set-cookie') ?? ''];
  const transactionCookie = cookies
    .map((value) => value.split(';', 1)[0])
    .find((value) => value.startsWith('carelensOidcTransaction='));
  assert.ok(transactionCookie, 'Mock login did not set the OIDC transaction cookie');

  const loginComplete = await request(callbackUrl, {
    headers: { cookie: transactionCookie },
    redirect: 'manual',
  });
  assert.equal(loginComplete.status, 200, 'Mock OIDC callback failed');
  const login = await loginComplete.json();
  assert.equal(login.role, 'patient');
  assert.equal(typeof login.accessToken, 'string');
  log('Local mock sign-in: patient');

  const authorization = { Authorization: `Bearer ${login.accessToken}` };
  const submitted = await request(`${frontend}/api/v1/patient/questionnaires`, {
    method: 'POST',
    headers: {
      ...authorization,
      'content-type': 'application/json',
      'Idempotency-Key': `d1-smoke-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ responses: {
      ageYears: 44,
      bmi: 27.2,
      sex: 'female',
      waistCm: 88,
      activity30MinDaily: false,
      fruitVegetablesDaily: false,
      antihypertensiveTreatment: false,
      historyHighGlucose: false,
      familyHistoryDiabetes: 'second_degree',
    } }),
  });
  assert.equal(submitted.status, 202, `Questionnaire submission returned HTTP ${submitted.status}`);
  const submission = await submitted.json();

  let completed;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await request(`${frontend}/api/v1/patient/questionnaires/${submission.questionnaireId}`, {
      headers: authorization,
    });
    assert.equal(status.status, 200, `Questionnaire status returned HTTP ${status.status}`);
    completed = await status.json();
    if (completed.status === 'complete') break;
    assert.notEqual(completed.status, 'failed', 'Scoring job failed');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(completed?.status, 'complete', 'Scoring did not complete within 60 seconds');
  assert.equal(typeof completed.predictionId, 'string');

  const reportResponse = await request(`${frontend}/api/v1/patient/reports/${completed.predictionId}`, {
    headers: authorization,
  });
  assert.equal(reportResponse.status, 200, `Report read returned HTTP ${reportResponse.status}`);
  const report = await reportResponse.json();
  assert.equal(typeof report.basicScore, 'number');
  assert.equal(typeof report.mlScore, 'number', 'ML refinement score was missing');
  assert.equal(report.scoreSource, 'ml_refined');
  assert.equal(typeof report.modelVersion, 'string');
  assert.match(report.disclaimer, /screening aid, not a diagnosis/i);
  log(`Submit-to-report cycle: ${report.scoreSource} (${report.modelVersion})`);
  process.stdout.write('D1 local smoke passed. Synthetic data only.\n');
}

main().catch((error) => {
  process.stderr.write(`FAIL D1 local smoke: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
