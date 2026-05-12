const STATUS_CLASS: Record<string, string> = {
  pending: 'pill-pending',
  processing: 'pill-processing',
  processed: 'pill-processed',
  done: 'pill-processed',
  dead: 'pill-dead',
  fresh: 'pill-fresh',
  stale: 'pill-stale',
  missing: 'pill-missing',
  streaming: 'pill-success',
  disconnected: 'pill-neutral',
};

type Tone = 'success' | 'error' | 'neutral';

interface Props {
  status: string;
  tone?: Tone;
}

export default function StatusPill({ status, tone }: Props) {
  const toneClass = tone ? `pill-${tone}` : STATUS_CLASS[status] ?? 'pill-neutral';
  return <span className={`pill ${toneClass}`}>{status}</span>;
}
