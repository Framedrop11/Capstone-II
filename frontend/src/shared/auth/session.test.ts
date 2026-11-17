import { describe, expect, it } from 'vitest';
import { isPopupSessionEvent } from './session';

describe('popup session handoff validation', () => {
  it('accepts only a matching popup, same-origin message and valid role', () => {
    const popup = {} as MessageEventSource;
    const valid = {
      origin: 'https://carelens.test',
      source: popup,
      data: {
        type: 'carelens:auth-complete',
        accessToken: 'jwt-memory-only',
        userId: 'u1',
        role: 'patient',
      },
    } as Pick<MessageEvent, 'origin' | 'source' | 'data'>;
    expect(isPopupSessionEvent(valid, popup, 'https://carelens.test')?.accessToken).toBe(
      'jwt-memory-only',
    );
    expect(
      isPopupSessionEvent(
        { ...valid, origin: 'https://attacker.test' },
        popup,
        'https://carelens.test',
      ),
    ).toBeNull();
    expect(
      isPopupSessionEvent(
        { ...valid, source: {} as MessageEventSource },
        popup,
        'https://carelens.test',
      ),
    ).toBeNull();
    expect(
      isPopupSessionEvent(
        { ...valid, data: { ...(valid.data as object), role: 'superuser' } },
        popup,
        'https://carelens.test',
      ),
    ).toBeNull();
  });
});
