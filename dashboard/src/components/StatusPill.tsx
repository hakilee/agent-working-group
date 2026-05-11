type Tone =
  | 'thinking'
  | 'grep'
  | 'read'
  | 'edit'
  | 'done'
  | 'success'
  | 'error'
  | 'neutral';

const BG: Record<Tone, string> = {
  thinking: 'var(--color-timeline-thinking)',
  grep: 'var(--color-timeline-grep)',
  read: 'var(--color-timeline-read)',
  edit: 'var(--color-timeline-edit)',
  done: 'var(--color-timeline-done)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  neutral: 'var(--color-surface-strong)',
};

const FG: Record<Tone, string> = {
  thinking: 'var(--color-ink)',
  grep: 'var(--color-ink)',
  read: 'var(--color-ink)',
  edit: 'var(--color-ink)',
  done: 'var(--color-on-primary)',
  success: 'var(--color-on-primary)',
  error: 'var(--color-on-primary)',
  neutral: 'var(--color-ink)',
};

// Map AWG queue/heartbeat states to the DESIGN.md tone palette. Timeline
// pastels are intentionally reused here because the dashboard *is* an agent
// activity surface — that's what they were designed for.
const STATUS_TONE: Record<string, Tone> = {
  pending: 'thinking',
  processing: 'read',
  processed: 'done',
  done: 'done',
  dead: 'error',
  fresh: 'success',
  stale: 'thinking',
  missing: 'error',
};

interface Props {
  status: string;
  tone?: Tone;
}

export default function StatusPill({ status, tone }: Props) {
  const t: Tone = tone ?? STATUS_TONE[status] ?? 'neutral';
  return (
    <span
      className="t-caption-uppercase"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: BG[t],
        color: FG[t],
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}
