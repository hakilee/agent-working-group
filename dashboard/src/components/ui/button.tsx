import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

type ButtonTone = 'neutral' | 'danger' | 'warning';

const buttonToneClass: Record<ButtonTone, string> = {
  neutral: 'border-transparent bg-[#ebe6da] text-ops-ink hover:border-ops-line hover:bg-emerald-50 dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15',
  danger: 'border-rose-500/40 bg-rose-50/70 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-900/40',
  warning: 'border-amber-500/40 bg-amber-50/70 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/40',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ControlSize;
  tone?: ButtonTone;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ size = 'small', tone = 'neutral', className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 border font-bold transition disabled:cursor-not-allowed disabled:opacity-50', controlSizeClass[size], buttonToneClass[tone], className)}
      {...props}
    >
      {children}
    </button>
  );
});
