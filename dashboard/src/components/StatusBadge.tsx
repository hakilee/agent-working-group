const KNOWN = new Set([
  'pending',
  'processing',
  'processed',
  'dead',
  'fresh',
  'stale',
  'missing',
]);

export default function StatusBadge({ status }: { status: string }) {
  const variant = KNOWN.has(status) ? status : 'default';
  return <span className={`status-badge status-badge--${variant}`}>{status}</span>;
}
