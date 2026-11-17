import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { mlBreakerState, mlRequestDuration, mlRequests, predictionScores, renderWorkerMetrics, scoringFallbacks, startWorkerMetricsServer, workerJobDuration, workerJobs, workerQueueDepth } from '../../services/worker/src/observability.js';

test('worker exports queue, scoring, fallback, ML latency and circuit metrics', async () => {
  workerJobs.inc({ outcome: 'success', job_name: 'score-questionnaire' });
  workerJobDuration.observe({ job_name: 'score-questionnaire' }, 0.25);
  workerQueueDepth.set({ state: 'waiting' }, 3);
  mlRequests.inc({ result: 'success' });
  mlRequestDuration.observe(0.05);
  mlBreakerState.set(0);
  scoringFallbacks.inc();
  predictionScores.observe({ source: 'ml_refined' }, 0.42);
  const metrics = await renderWorkerMetrics();
  for (const name of [
    'carelens_worker_jobs_total', 'carelens_worker_job_duration_seconds', 'carelens_worker_queue_jobs',
    'carelens_ml_requests_total', 'carelens_ml_request_duration_seconds', 'carelens_ml_circuit_breaker_state',
    'carelens_scoring_fallbacks_total', 'carelens_prediction_score',
  ]) assert.ok(metrics.includes(name), `${name} is exposed`);
});

test('worker metrics server exposes the Prometheus scrape endpoint', async () => {
  const server = await startWorkerMetricsServer(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /carelens_worker_queue_jobs/);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/healthz`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('Prometheus alerts, targets and Grafana dashboard files are parseable and include required panels', async () => {
  const root = process.cwd();
  const alerts = parse(await readFile(resolve(root, 'infra/monitoring/alerts.yml'), 'utf8')) as { groups: Array<{ rules: Array<{ alert: string; expr: string }> }> };
  const config = parse(await readFile(resolve(root, 'infra/monitoring/prometheus.yml'), 'utf8')) as { scrape_configs: Array<{ job_name: string }> };
  const dashboard = JSON.parse(await readFile(resolve(root, 'infra/monitoring/grafana/carelens-overview.json'), 'utf8')) as { panels: Array<{ title: string }> };
  const ruleNames = alerts.groups.flatMap((group) => group.rules.map((rule) => rule.alert));
  assert.ok(ruleNames.includes('CareLensScoreDistributionDrift'));
  assert.ok(ruleNames.includes('CareLensScoringFallbackRateHigh'));
  assert.ok(ruleNames.every((name) => name.length > 0));
  assert.deepEqual(config.scrape_configs.map((job) => job.job_name).sort(), ['carelens-core-api', 'carelens-ml-service', 'carelens-worker']);
  assert.ok(dashboard.panels.some((panel) => panel.title.includes('Cache')));
  assert.ok(dashboard.panels.some((panel) => panel.title.includes('circuit')));
});
