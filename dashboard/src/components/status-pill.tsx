import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

const toneByStatus: Record<string, string> = {
  pending: 'pill-pending', stale: 'pill-stale', processing: 'pill-processing',
  processed: 'pill-processed', done: 'pill-processed', fresh: 'pill-fresh', streaming: 'pill-success',
  running: 'pill-processed', attached: 'pill-processing',
  dead: 'pill-dead', missing: 'pill-missing', error: 'pill-error', disconnected: 'pill-neutral',
};

export default function StatusPill({ status, className, children }: { status: string; className?: string; children?: ReactNode }) {
  return <span className={cn('pill', toneByStatus[status] ?? 'pill-neutral', className)}>{children ?? status}</span>;
}
