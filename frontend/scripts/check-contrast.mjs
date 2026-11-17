import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const tokenFile = fileURLToPath(new URL('../src/design/tokens.css', import.meta.url));
const css = await readFile(tokenFile, 'utf8');
const rawTokens = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[\da-fA-F]{6}|var\(--[\w-]+\))\s*;/g)].map(
    ([, name, value]) => [name, value],
  ),
);

function token(name, visited = new Set()) {
  assert.ok(rawTokens[name], `Missing color token: ${name}`);
  assert.ok(!visited.has(name), `Circular color token reference: ${name}`);
  visited.add(name);
  const value = rawTokens[name];
  const referencedName = value.match(/^var\(--([\w-]+)\)$/)?.[1];
  return referencedName ? token(referencedName, visited) : value;
}

function luminance(hex) {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)
    .map((component) => Number.parseInt(component, 16) / 255);
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const checks = [
  ['primary text on white', 'text-primary', 'surface'],
  ['primary button text on pink', 'text-on-accent', 'pink-500'],
  ['low risk label', 'blue-800', 'blue-50'],
  ['moderate risk label', 'blue-900', 'blue-100'],
  ['high risk label', 'blue-900', 'pink-500'],
  ['error message', 'semantic-error-text', 'semantic-error-background'],
  ['success message', 'semantic-success-text', 'semantic-success-background'],
];

for (const [label, foregroundKey, backgroundKey] of checks) {
  const foreground = token(foregroundKey);
  const background = token(backgroundKey);
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1 is below WCAG AA 4.5:1`);
  process.stdout.write(`${label}: ${ratio.toFixed(2)}:1 PASS\n`);
}

const pinkOnWhite = contrast(token('pink-500'), token('surface'));
assert.ok(
  pinkOnWhite < 4.5,
  `Pink on white is ${pinkOnWhite.toFixed(2)}:1; do not use it for text`,
);
process.stdout.write(
  `pink on white remains below text contrast (${pinkOnWhite.toFixed(2)}:1): PASS\n`,
);
