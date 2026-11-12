import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFindrisc, parseFindriscResponses } from '../../services/worker/src/scoring/findrisc.js';

const minimum = {
  ageYears: 40, bmi: 24.9, waistCm: 79, sex: 'female', activity30MinDaily: true,
  fruitVegetablesDaily: true, antihypertensiveTreatment: false, historyHighGlucose: false,
  familyHistoryDiabetes: 'none',
} as const;

test('FINDRISC maps minimum responses to zero points and a normalized zero score', () => {
  assert.deepEqual(calculateFindrisc(minimum), { points: 0, normalizedScore: 0, factors: ['FINDRISC total 0/26 (low)'], riskBand: 'low' });
});

test('FINDRISC applies every published weighted factor and score band', () => {
  const result = calculateFindrisc({ ...minimum, ageYears: 70, bmi: 34, waistCm: 105, sex: 'male', activity30MinDaily: false, fruitVegetablesDaily: false, antihypertensiveTreatment: true, historyHighGlucose: true, familyHistoryDiabetes: 'first_degree' });
  assert.equal(result.points, 26);
  assert.equal(result.normalizedScore, 1);
  assert.equal(result.riskBand, 'very_high');
  assert.equal(result.factors.length, 9);
});

test('FINDRISC rejects missing and malformed questionnaire fields', () => {
  assert.throws(() => parseFindriscResponses({}), /missing ageYears/);
  assert.throws(() => calculateFindrisc({ ...minimum, waistCm: 300 }), /waistCm/);
});
