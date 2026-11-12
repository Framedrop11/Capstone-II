import { Counter, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import type { RequestHandler } from 'express';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const requestCount = new Counter({
  name: 'carelens_http_requests_total',
  help: 'Number of HTTP requests served by CareLens Core API',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});
const requestDuration = new Histogram({
  name: 'carelens_http_request_duration_seconds',
  help: 'Core API HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpMetricsMiddleware: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on('finish', () => {
    const route = `${request.baseUrl}${request.route?.path ?? request.path}`;
    const labels = { method: request.method, route, status_code: String(response.statusCode) };
    requestCount.inc(labels);
    requestDuration.observe(labels, Number(process.hrtime.bigint() - startedAt) / 1_000_000_000);
  });
  next();
};

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
