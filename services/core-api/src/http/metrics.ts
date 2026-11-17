import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import type { RequestHandler } from 'express';
import { writeLog } from '../../../../packages/shared/src/index.js';
import './correlation.js';

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
const cacheOperations = new Counter({
  name: 'carelens_cache_operations_total',
  help: 'Cache operations by cache, operation, and result',
  labelNames: ['cache', 'operation', 'result'] as const,
  registers: [registry],
});
const rateLimitOutcomes = new Counter({
  name: 'carelens_rate_limit_requests_total',
  help: 'Requests allowed or blocked by the Redis rate limiter',
  labelNames: ['result'] as const,
  registers: [registry],
});
const dependencyHealth = new Gauge({
  name: 'carelens_dependency_ready',
  help: 'Core API dependency readiness (1 ready, 0 unavailable)',
  labelNames: ['dependency'] as const,
  registers: [registry],
});
export function recordCacheOperation(cache: string, operation: string, result: string): void {
  cacheOperations.inc({ cache, operation, result });
}

export function recordRateLimitOutcome(result: 'allowed' | 'blocked' | 'fail_open'): void {
  rateLimitOutcomes.inc({ result });
}

export function setDependencyReady(dependency: string, ready: boolean): void {
  dependencyHealth.set({ dependency }, ready ? 1 : 0);
}

export const httpMetricsMiddleware: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on('finish', () => {
    const route = `${request.baseUrl}${request.route?.path ?? 'unmatched'}`;
    const labels = { method: request.method, route, status_code: String(response.statusCode) };
    const duration = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    requestCount.inc(labels);
    requestDuration.observe(labels, duration);
    writeLog(response.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      service: 'carelens-core-api',
      correlationId: request.correlationId,
      method: request.method,
      route,
      statusCode: response.statusCode,
      durationMs: Math.round(duration * 1000),
    });
  });
  next();
};

export async function renderMetrics(): Promise<string> {
  return registry.metrics();
}

export const metricsContentType = registry.contentType;
