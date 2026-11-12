import assert from 'node:assert/strict';
import test from 'node:test';
import { CircuitBreaker, CircuitOpenError } from '../../services/worker/src/ml/circuit-breaker.js';

test('circuit breaker opens after repeated failures, allows one half-open probe, then closes on recovery', async () => {
  let now = 1_000;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 100, now: () => now });
  await assert.rejects(breaker.execute(async () => { throw new Error('down'); }));
  await assert.rejects(breaker.execute(async () => { throw new Error('down'); }));
  assert.equal(breaker.state, 'open');
  await assert.rejects(breaker.execute(async () => 'not called'), CircuitOpenError);
  now += 100;
  assert.equal(breaker.state, 'half_open');
  const pending = breaker.execute(async () => 'probe');
  await assert.rejects(breaker.execute(async () => 'overlapping probe'), CircuitOpenError);
  assert.equal(await pending, 'probe');
  assert.equal(breaker.state, 'closed');
});
