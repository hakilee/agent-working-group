interface Props {
  label: string;
  value: number | string;
  hint?: string;
}

export default function StatsCard({ label, value, hint }: Props) {
  return (
    <div
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
      }}
    >
      <div className="t-title-sm" style={{ color: 'var(--color-body)' }}>
        {label}
      </div>
      <div
        className="t-display-lg"
        style={{ color: 'var(--color-ink)', marginTop: 'var(--space-xs)' }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="t-caption"
          style={{ color: 'var(--color-muted)', marginTop: 'var(--space-xs)' }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
