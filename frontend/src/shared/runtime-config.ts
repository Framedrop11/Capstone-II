export type CareLensRuntimeConfig = {
  environment?: string;
  authProvider?: 'google' | 'mock';
  apiBaseUrl?: string;
};

declare global {
  interface Window {
    CARELENS_CONFIG?: CareLensRuntimeConfig;
  }
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.CARELENS_CONFIG?.apiBaseUrl || window.location.origin;
}
