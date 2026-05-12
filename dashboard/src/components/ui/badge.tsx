import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

type BadgeTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

const badgeToneClass: Record<BadgeTone, string> = {
  neutral: 'border-transparent bg-[#ebe6da] text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]',
  warning: 'border-amber-400/30 bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-200',
  info: 'border-blue-400/30 bg-blue-100 text-blue-950 dark:bg-blue-400/15 dark:text-blue-200',
  success: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  danger: 'border-rose-400/30 bg-rose-100 text-rose-950 dark:bg-rose-400/15 dark:text-rose-200',
};

export function Badge({ tone = 'neutral', size = 'x-small', className, children }: { tone?: BadgeTone; size?: ControlSize; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap border font-bold uppercase tracking-[.06em]', controlSizeClass[size], badgeToneClass[tone], className)}>
      {children}
    </span>
  );
}
