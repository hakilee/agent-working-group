import StatusPill from './StatusPill';
import type { SystemStatus } from '../api/client';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityItem({ entry }: { entry: Entry }) {
  return (
    <li
      style={{
        listStyle: 'none',
        padding: 'var(--space-sm) var(--space-base)',
        borderBottom: '1px solid var(--color-hairline-soft)',
        display: 'flex',
        gap: 'var(--space-base)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs)',
            flexWrap: 'wrap',
          }}
        >
          <StatusPill status={entry.kind ?? 'msg'} tone="neutral" />
          <span className="t-code" style={{ color: 'var(--color-ink)' }}>
            {entry.from ?? '?'}
          </span>
          <span className="t-body-sm" style={{ color: 'var(--color-muted)' }}>
            →
          </span>
          <span className="t-code" style={{ color: 'var(--color-ink)' }}>
            {entry.to ?? '?'}
          </span>
        </div>
        <div
          className="t-body-md"
          style={{
            color: 'var(--color-body)',
            marginTop: 'var(--space-xxs)',
            wordBreak: 'break-word',
          }}
        >
          {entry.body}
        </div>
      </div>
      <div
        className="t-caption"
        style={{
          color: 'var(--color-muted)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {entry.createdAt ?? '—'}
      </div>
    </li>
  );
}
