export interface FindriscResponses {
  ageYears: number;
  bmi: number;
  waistCm: number;
  sex: 'female' | 'male';
  activity30MinDaily: boolean;
  fruitVegetablesDaily: boolean;
  antihypertensiveTreatment: boolean;
  historyHighGlucose: boolean;
  familyHistoryDiabetes: 'none' | 'second_degree' | 'first_degree';
}

export interface BasicScore {
  points: number;
  normalizedScore: number;
  factors: string[];
  riskBand: 'low' | 'slightly_elevated' | 'moderate' | 'high' | 'very_high';
}

export function parseFindriscResponses(value: unknown): FindriscResponses {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Questionnaire responses must be an object');
  const input = value as Record<string, unknown>;
  const required: (keyof FindriscResponses)[] = ['ageYears', 'bmi', 'waistCm', 'sex', 'activity30MinDaily', 'fruitVegetablesDaily', 'antihypertensiveTreatment', 'historyHighGlucose', 'familyHistoryDiabetes'];
  for (const field of required) if (!(field in input)) throw new Error(`Questionnaire response is missing ${field}`);
  if (!Number.isInteger(input['ageYears']) || Number(input['ageYears']) < 18 || Number(input['ageYears']) > 120) throw new Error('ageYears must be an integer from 18 to 120');
  if (typeof input['bmi'] !== 'number' || !Number.isFinite(input['bmi']) || input['bmi'] < 10 || input['bmi'] > 100) throw new Error('bmi must be a finite value from 10 to 100');
  if (typeof input['waistCm'] !== 'number' || !Number.isFinite(input['waistCm']) || input['waistCm'] < 40 || input['waistCm'] > 200) throw new Error('waistCm must be a finite value from 40 to 200');
  if (input['sex'] !== 'female' && input['sex'] !== 'male') throw new Error('sex must be female or male for the validated waist thresholds');
  for (const field of ['activity30MinDaily', 'fruitVegetablesDaily', 'antihypertensiveTreatment', 'historyHighGlucose']) {
    if (typeof input[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
  }
  if (!['none', 'second_degree', 'first_degree'].includes(String(input['familyHistoryDiabetes']))) throw new Error('familyHistoryDiabetes must be none, second_degree, or first_degree');
  return input as unknown as FindriscResponses;
}

export function calculateFindrisc(value: unknown): BasicScore {
  const answer = parseFindriscResponses(value);
  let points = 0;
  const factors: string[] = [];
  const add = (score: number, label: string): void => { points += score; if (score > 0) factors.push(label); };
  add(answer.ageYears < 45 ? 0 : answer.ageYears < 55 ? 2 : answer.ageYears < 65 ? 3 : 4, 'age');
  add(answer.bmi < 25 ? 0 : answer.bmi < 30 ? 1 : 3, 'body mass index');
  const waistHigh = answer.sex === 'male' ? answer.waistCm > 102 : answer.waistCm > 88;
  const waistElevated = answer.sex === 'male' ? answer.waistCm >= 94 : answer.waistCm >= 80;
  add(waistHigh ? 4 : waistElevated ? 3 : 0, 'waist circumference');
  add(answer.activity30MinDaily ? 0 : 2, 'physical activity');
  add(answer.fruitVegetablesDaily ? 0 : 1, 'fruit and vegetable intake');
  add(answer.antihypertensiveTreatment ? 2 : 0, 'antihypertensive treatment');
  add(answer.historyHighGlucose ? 5 : 0, 'history of high blood glucose');
  add(answer.familyHistoryDiabetes === 'first_degree' ? 5 : answer.familyHistoryDiabetes === 'second_degree' ? 3 : 0, 'family history of diabetes');
  const riskBand = points <= 6 ? 'low' : points <= 11 ? 'slightly_elevated' : points <= 14 ? 'moderate' : points <= 20 ? 'high' : 'very_high';
  return { points, normalizedScore: points / 26, factors: [`FINDRISC total ${points}/26 (${riskBand.replaceAll('_', ' ')})`, ...factors], riskBand };
}
