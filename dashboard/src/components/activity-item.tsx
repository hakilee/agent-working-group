import type { SystemStatus } from '../api/client';
import StatusPill from './status-pill';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityItem({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="row-item w-full text-left transition hover:bg-black/5 dark:hover:bg-white/5" onClick={onOpen}>
        <div className="min-w-0 flex-1">
          <div className="row-meta mb-2">
            <StatusPill status={entry.kind ?? 'message'} />
            <span className="caption">{entry.from ?? '?'} -&gt; {entry.to ?? '?'}</span>
          </div>
          <p className="body break-words">{entry.body}</p>
        </div>
        <time className="caption shrink-0">{entry.createdAt ?? '-'}</time>
      </button>
    </li>
  );
}
