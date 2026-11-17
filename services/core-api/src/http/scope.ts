import { BadRequestError } from './errors.js';

const reportFields = new Set(['basicScore', 'mlScore', 'scoreSource', 'riskBand', 'factors', 'modelVersion', 'explanation']);

export function parseConsentScope(scope: string): Set<string> {
  if (scope === 'full_report') return new Set(reportFields);
  const fields = new Set(scope.split(',').map((field) => field.trim()).filter(Boolean));
  if (fields.size === 0 || [...fields].some((field) => !reportFields.has(field))) {
    throw new BadRequestError('Consent scope contains an unsupported report field');
  }
  return fields;
}
