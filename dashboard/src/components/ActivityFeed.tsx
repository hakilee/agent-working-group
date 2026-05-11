import type { SystemStatus } from '../api/client';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityFeed({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return <div className="card-dashed">No recent activity in the queue log.</div>;
  }
  return (
    <ul className="feed">
      {entries.map((entry, idx) => (
        <li key={`${entry.id ?? idx}-${entry.createdAtMs ?? idx}`} className="feed-item">
          <div className="feed-time">{entry.createdAt ?? '—'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="feed-meta">
              <span className="feed-kind">{entry.kind ?? 'msg'}</span>
              <span>
                <span className="feed-from">{entry.from ?? '?'}</span>
                <span className="feed-arrow">→</span>
                <span className="feed-to">{entry.to ?? '?'}</span>
              </span>
            </div>
            <div className="feed-body">{entry.body}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
