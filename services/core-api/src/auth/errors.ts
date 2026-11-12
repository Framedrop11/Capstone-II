export class AuthenticationError extends Error {
  readonly statusCode = 401;

  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  readonly statusCode = 403;

  constructor(message = 'Insufficient role') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class InvalidRefreshTokenError extends AuthenticationError {
  constructor() {
    super('Refresh token is invalid or expired');
    this.name = 'InvalidRefreshTokenError';
  }
}

export class RefreshTokenReuseError extends AuthenticationError {
  constructor() {
    super('Refresh token reuse detected; the token family has been revoked');
    this.name = 'RefreshTokenReuseError';
  }
}
