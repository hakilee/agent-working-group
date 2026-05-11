import type { SystemStatus } from '../api/client';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityFeed({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
        No recent activity in the queue log.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/30">
      {entries.map((entry, idx) => (
        <li key={`${entry.id ?? idx}-${entry.createdAtMs ?? idx}`} className="flex gap-3 p-3 text-sm">
          <div className="font-mono text-xs text-slate-500 w-44 shrink-0">
            {entry.createdAt ?? '—'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                {entry.kind ?? 'msg'}
              </span>
              <span className="text-slate-300">
                <span className="font-mono text-emerald-400">{entry.from ?? '?'}</span>
                <span className="px-1 text-slate-600">→</span>
                <span className="font-mono text-sky-400">{entry.to ?? '?'}</span>
              </span>
            </div>
            <div className="mt-1 text-slate-400 break-words">{entry.body}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
