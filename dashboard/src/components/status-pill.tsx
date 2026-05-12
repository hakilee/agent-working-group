import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

const basePillClass = 'inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.06em]';

const toneByStatus: Record<string, string> = {
  pending: 'border-amber-400/30 bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-200',
  stale: 'border-amber-400/30 bg-amber-100 text-amber-950 dark:bg-amber-400/15 dark:text-amber-200',
  processing: 'border-blue-400/30 bg-blue-100 text-blue-950 dark:bg-blue-400/15 dark:text-blue-200',
  processed: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  done: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  fresh: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  streaming: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  running: 'border-emerald-400/30 bg-emerald-100 text-emerald-950 dark:bg-emerald-400/15 dark:text-emerald-200',
  attached: 'border-blue-400/30 bg-blue-100 text-blue-950 dark:bg-blue-400/15 dark:text-blue-200',
  dead: 'border-rose-400/30 bg-rose-100 text-rose-950 dark:bg-rose-400/15 dark:text-rose-200',
  missing: 'border-rose-400/30 bg-rose-100 text-rose-950 dark:bg-rose-400/15 dark:text-rose-200',
  error: 'border-rose-400/30 bg-rose-100 text-rose-950 dark:bg-rose-400/15 dark:text-rose-200',
  disconnected: 'border-transparent bg-[#ebe6da] text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]',
};

const neutralPillClass = 'border-transparent bg-[#ebe6da] text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]';

export default function StatusPill({ status, className, children }: { status: string; className?: string; children?: ReactNode }) {
  return <span className={cn(basePillClass, toneByStatus[status] ?? neutralPillClass, className)}>{children ?? status}</span>;
}
