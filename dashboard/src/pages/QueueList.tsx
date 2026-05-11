import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusBadge from '../components/StatusBadge';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

export default function QueueList() {
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setError(null);
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const grouped = useMemo(() => items, [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Queue</h1>
        <div className="flex gap-1">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded px-2.5 py-1 text-xs uppercase tracking-wide transition-colors ${
                filter === value
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-500 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded border border-rose-800 bg-rose-900/30 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">state</th>
              <th className="px-3 py-2 font-medium">kind</th>
              <th className="px-3 py-2 font-medium">agent</th>
              <th className="px-3 py-2 font-medium">from → to</th>
              <th className="px-3 py-2 font-medium">body</th>
              <th className="px-3 py-2 font-medium">created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  loading…
                </td>
              </tr>
            )}
            {!loading && grouped.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  no items
                </td>
              </tr>
            )}
            {grouped.map((item) => (
              <tr key={`${item.agent}/${item.filename}`} className="hover:bg-slate-900/60">
                <td className="px-3 py-2">
                  <StatusBadge status={item.state} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{item.kind}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{item.agent}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {item.from ?? '?'} → {item.to ?? '?'}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  <Link to={`/queue/${item.id}`} className="hover:text-emerald-300">
                    {item.body.split('\n')[0].slice(0, 96) || '(empty)'}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.createdAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
