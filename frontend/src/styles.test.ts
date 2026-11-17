import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('responsive and motion style contracts', () => {
  it('defines mobile layouts for patient, doctor, admin and report views', () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)/);
    for (const selector of [
      '.patient-grid',
      '.report-layout',
      '.cl-doctor-layout',
      '.cl-admin-grid',
    ]) {
      expect(styles).toContain(selector);
    }
  });

  it('provides visible keyboard focus and reduced-motion behavior', () => {
    expect(styles).toContain('a:focus-visible');
    expect(styles).toContain('button:focus-visible');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
