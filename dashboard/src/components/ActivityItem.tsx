import type { SystemStatus } from '../api/client';
import StatusPill from './StatusPill';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityItem({ entry }: { entry: Entry }) {
  return (
    <li className="row-item">
      <div className="min-w-0 flex-1">
        <div className="row-meta mb-2">
          <StatusPill status={entry.kind ?? 'message'} />
          <span className="caption">{entry.from ?? '?'} → {entry.to ?? '?'}</span>
        </div>
        <p className="body break-words">{entry.body}</p>
      </div>
      <time className="caption shrink-0">{entry.createdAt ?? '—'}</time>
    </li>
  );
}
