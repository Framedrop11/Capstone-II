import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['cl-card', className].filter(Boolean).join(' ')} {...props} />;
}
