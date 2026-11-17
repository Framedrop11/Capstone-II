import { afterEach, describe, expect, it } from 'vitest';
import { getApiBaseUrl } from './runtime-config';

describe('runtime API configuration', () => {
  afterEach(() => {
    delete window.CARELENS_CONFIG;
  });

  it('uses the configured API origin when present', () => {
    window.CARELENS_CONFIG = { apiBaseUrl: 'https://carelens.example.test' };
    expect(getApiBaseUrl()).toBe('https://carelens.example.test');
  });

  it('defaults to the current origin so refresh cookies stay same-origin', () => {
    window.CARELENS_CONFIG = { apiBaseUrl: '' };
    expect(getApiBaseUrl()).toBe(window.location.origin);
  });
});
