import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId?: string;
  }
}

const suppliedIdPattern = /^[A-Fa-f0-9-]{36}$/;

export const correlationIdMiddleware: RequestHandler = (request, response, next) => {
  const supplied = request.get('x-correlation-id');
  const correlationId = supplied && suppliedIdPattern.test(supplied) ? supplied : randomUUID();
  request.correlationId = correlationId;
  response.setHeader('X-Correlation-ID', correlationId);
  next();
};
