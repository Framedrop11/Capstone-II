import type { SVGProps } from 'react';

export type RiskLevel = 'low' | 'moderate' | 'high';

const riskLabels: Record<RiskLevel, string> = {
  low: 'Low risk',
  moderate: 'Moderate risk',
  high: 'High risk',
};

function RiskShape({ level, ...props }: SVGProps<SVGSVGElement> & { level: RiskLevel }) {
  if (level === 'low')
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
        <circle cx="8" cy="8" r="5" fill="currentColor" />
      </svg>
    );
  if (level === 'moderate')
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
        <path d="M8 2 15 14H1L8 2Z" fill="currentColor" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`cl-risk-badge cl-risk-badge--${level}`}>
      <RiskShape className="cl-risk-badge__shape" level={level} />
      <span>{riskLabels[level]}</span>
    </span>
  );
}
