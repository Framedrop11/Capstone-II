import { describe, expect, it } from 'vitest';
import { transitionForMotionPreference } from './motion';

describe('motion preferences', () => {
  it('keeps transitions brief and removes motion when reduced motion is requested', () => {
    expect(transitionForMotionPreference(false).duration).toBeLessThanOrEqual(0.18);
    expect(transitionForMotionPreference(true).duration).toBe(0);
  });
});
