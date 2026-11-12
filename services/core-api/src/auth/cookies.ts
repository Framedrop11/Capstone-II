const REFRESH_COOKIE_NAME = 'carelensRefresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function serializeRefreshCookie(token: string, maxAgeSeconds: number): string {
  if (!token || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0) throw new Error('Invalid refresh cookie values');
  return `${REFRESH_COOKIE_NAME}=${token}; Path=${REFRESH_COOKIE_PATH}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearRefreshCookie(): string {
  return `${REFRESH_COOKIE_NAME}=; Path=${REFRESH_COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export const refreshCookieName = REFRESH_COOKIE_NAME;
