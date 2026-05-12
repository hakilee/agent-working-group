import StatusPill from './StatusPill';
import type { SystemStatus } from '../api/client';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityItem({ entry }: { entry: Entry }) {
  return (
    <li className="row-item">
      <div className="row-main">
        <div className="row-meta">
          <StatusPill status={entry.kind ?? 'message'} />
          <span className="mono caption">{entry.from ?? '?'} → {entry.to ?? '?'}</span>
        </div>
        <p className="body">{entry.body}</p>
      </div>
      <time className="mono caption">{entry.createdAt ?? '—'}</time>
    </li>
  );
}
