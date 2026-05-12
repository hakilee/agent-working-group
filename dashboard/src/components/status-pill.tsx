import type { ReactNode } from 'react';
import { Badge } from './ui/badge';
import type { ControlSize } from './ui/sizing';

const toneByStatus: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  stale: 'warning',
  processing: 'info',
  processed: 'success',
  done: 'success',
  fresh: 'success',
  streaming: 'success',
  running: 'success',
  attached: 'info',
  dead: 'danger',
  missing: 'danger',
  error: 'danger',
  disconnected: 'neutral',
};

export default function StatusPill({ status, className, children, size = 'x-small' }: { status: string; className?: string; children?: ReactNode; size?: ControlSize }) {
  return <Badge tone={toneByStatus[status] ?? 'neutral'} size={size} className={className}>{children ?? status}</Badge>;
}
