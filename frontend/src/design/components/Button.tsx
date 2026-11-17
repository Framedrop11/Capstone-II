import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  const classes = ['cl-button', `cl-button--${variant}`, className].filter(Boolean).join(' ');
  return <button className={classes} type={type} {...props} />;
}
