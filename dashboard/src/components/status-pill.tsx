import type { ReactNode } from 'react';
import { Badge, type BadgeVariant } from './ui/badge';
import type { ControlSize } from './ui/sizing';

const variantByStatus: Record<string, BadgeVariant> = {
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
  return <Badge variant={variantByStatus[status] ?? 'neutral'} size={size} className={className}>{children ?? status}</Badge>;
}
