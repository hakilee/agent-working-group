import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

export type BadgeVariant = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

const badgeVariantClass: Record<BadgeVariant, string> = {
  neutral: [
    'border-transparent bg-[#ebe6da] text-ops-ink',
    'hover:bg-[#ded7c8] active:bg-[#d2cab9]',
    'dark:bg-white/10 dark:text-[#eef3ec] dark:hover:bg-white/15 dark:active:bg-white/20',
  ].join(' '),
  warning: [
    'border-amber-400/30 bg-amber-100 text-amber-950',
    'hover:border-amber-400/50 hover:bg-amber-200/70 active:bg-amber-200',
    'dark:bg-amber-400/15 dark:text-amber-200 dark:hover:bg-amber-400/25 dark:active:bg-amber-400/30',
  ].join(' '),
  info: [
    'border-blue-400/30 bg-blue-100 text-blue-950',
    'hover:border-blue-400/50 hover:bg-blue-200/70 active:bg-blue-200',
    'dark:bg-blue-400/15 dark:text-blue-200 dark:hover:bg-blue-400/25 dark:active:bg-blue-400/30',
  ].join(' '),
  success: [
    'border-emerald-400/30 bg-emerald-100 text-emerald-950',
    'hover:border-emerald-400/50 hover:bg-emerald-200/70 active:bg-emerald-200',
    'dark:bg-emerald-400/15 dark:text-emerald-200 dark:hover:bg-emerald-400/25 dark:active:bg-emerald-400/30',
  ].join(' '),
  danger: [
    'border-rose-400/30 bg-rose-100 text-rose-950',
    'hover:border-rose-400/50 hover:bg-rose-200/70 active:bg-rose-200',
    'dark:bg-rose-400/15 dark:text-rose-200 dark:hover:bg-rose-400/25 dark:active:bg-rose-400/30',
  ].join(' '),
};

export function Badge({ variant = 'neutral', size = 'x-small', className, children }: { variant?: BadgeVariant; size?: ControlSize; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap border font-bold uppercase tracking-[.06em] transition-colors', controlSizeClass[size], badgeVariantClass[variant], className)}>
      {children}
    </span>
  );
}
