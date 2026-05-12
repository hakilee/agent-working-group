import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

export type ButtonVariant = 'neutral' | 'warning' | 'danger';

const buttonVariantClass: Record<ButtonVariant, string> = {
  neutral: [
    'border-transparent bg-[#ebe6da] text-ops-ink',
    'hover:border-ops-line hover:bg-emerald-50',
    'active:border-ops-green active:bg-emerald-100 active:text-ops-green',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ops-green/60',
    'dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15 dark:active:bg-emerald-400/25 dark:active:text-emerald-100',
  ].join(' '),
  warning: [
    'border-amber-500/40 bg-amber-50/70 text-amber-800',
    'hover:border-amber-500/60 hover:bg-amber-100',
    'active:border-amber-600 active:bg-amber-200 active:text-amber-950',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/60',
    'dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/40 dark:active:bg-amber-800/45',
  ].join(' '),
  danger: [
    'border-rose-500/40 bg-rose-50/70 text-rose-700',
    'hover:border-rose-500/65 hover:bg-rose-100',
    'active:border-rose-600 active:bg-rose-200 active:text-rose-950',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60',
    'dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-900/40 dark:active:bg-rose-800/45',
  ].join(' '),
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize;
  variant?: ButtonVariant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ size = 'small', variant = 'neutral', className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 border font-bold transition disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-[#ebe6da] dark:disabled:hover:bg-white/10', controlSizeClass[size], buttonVariantClass[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
});
