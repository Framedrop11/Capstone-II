export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found') { super(404, message); this.name = 'NotFoundError'; }
}

export class ConflictError extends HttpError {
  constructor(message = 'Resource conflict') { super(409, message); this.name = 'ConflictError'; }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Request is invalid') { super(400, message); this.name = 'BadRequestError'; }
}
