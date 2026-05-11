import { Badge, type BadgeProps } from '@seed-design/react';

type Tone = NonNullable<BadgeProps['tone']>;

const TONE_BY_STATUS: Record<string, Tone> = {
  pending: 'warning',
  processing: 'informative',
  processed: 'positive',
  dead: 'critical',
  fresh: 'positive',
  stale: 'warning',
  missing: 'critical',
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? 'neutral';
  return (
    <Badge tone={tone} variant="weak" size="medium">
      {status}
    </Badge>
  );
}
