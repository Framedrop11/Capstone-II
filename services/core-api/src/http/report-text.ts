import type { PredictionDocument } from '../data/models.js';

export const screeningDisclaimer = 'CareLens is a screening aid, not a diagnosis. Discuss results with a qualified healthcare professional.';

export function reportExplanation(prediction: PredictionDocument): string {
  const factors = prediction.factors.filter((factor) => factor.trim().length > 0).slice(0, 5);
  if (factors.length === 0) return 'This report summarizes the submitted questionnaire. Review the results with a qualified healthcare professional.';
  return `Questionnaire factors associated with this screening result: ${factors.join(', ')}. Review the results with a qualified healthcare professional.`;
}
