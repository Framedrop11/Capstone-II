import { createServer, type Server } from 'node:http';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const workerJobs = new Counter({
  name: 'carelens_worker_jobs_total', help: 'Scoring worker job attempts by outcome and type',
  labelNames: ['outcome', 'job_name'] as const, registers: [registry],
});
export const workerJobDuration = new Histogram({
  name: 'carelens_worker_job_duration_seconds', help: 'Scoring worker job execution time',
  labelNames: ['job_name'] as const, buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10], registers: [registry],
});
export const workerQueueDepth = new Gauge({
  name: 'carelens_worker_queue_jobs', help: 'Scoring queue jobs by BullMQ state',
  labelNames: ['state'] as const, registers: [registry],
});
export const mlRequests = new Counter({
  name: 'carelens_ml_requests_total', help: 'ML requests by result',
  labelNames: ['result'] as const, registers: [registry],
});
export const mlRequestDuration = new Histogram({
  name: 'carelens_ml_request_duration_seconds', help: 'ML service request latency',
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5], registers: [registry],
});
export const mlBreakerState = new Gauge({
  name: 'carelens_ml_circuit_breaker_state', help: 'ML breaker state (0 closed, 1 open, 2 half-open)',
  registers: [registry],
});
export const scoringFallbacks = new Counter({
  name: 'carelens_scoring_fallbacks_total', help: 'Scoring jobs completed without ML refinement', registers: [registry],
});
export const predictionScores = new Histogram({
  name: 'carelens_prediction_score', help: 'Distribution of persisted normalized scores',
  labelNames: ['source'] as const, buckets: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], registers: [registry],
});

export async function renderWorkerMetrics(): Promise<string> { return registry.metrics(); }

export async function startWorkerMetricsServer(port: number): Promise<Server> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': registry.contentType });
    response.end(await registry.metrics());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.off('error', reject); resolve(); });
  });
  return server;
}
