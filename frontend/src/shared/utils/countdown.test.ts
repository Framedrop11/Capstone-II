import { describe, expect, it } from 'vitest';
import { formatCountdown, secondsUntil } from './countdown';

describe('consent and scoped-token countdown helpers', () => {
  it('clamps expired or invalid times and formats remaining time as mm:ss', () => {
    expect(secondsUntil(15_000, 10_000)).toBe(5);
    expect(secondsUntil(9_999, 10_000)).toBe(0);
    expect(secondsUntil('not-a-date', 10_000)).toBe(0);
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(-1)).toBe('00:00');
  });
});
