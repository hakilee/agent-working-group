import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function QueueDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [item, setItem] = useState<QueueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getQueueItem(id)
      .then((data) => !cancelled && setItem(data))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="rounded border border-rose-800 bg-rose-900/30 p-3 text-sm text-rose-300">
        {error}
      </div>
    );
  }
  if (!item) return <div className="text-sm text-slate-400">loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/queue" className="text-xs text-slate-400 hover:text-slate-200">
          ← back to queue
        </Link>
        <StatusBadge status={item.state} />
      </div>

      <header className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs uppercase tracking-wide text-slate-300">
            {item.kind}
          </span>
          <span className="font-mono text-emerald-400">{item.from ?? '?'}</span>
          <span className="text-slate-600">→</span>
          <span className="font-mono text-sky-400">{item.to ?? '?'}</span>
          <span className="ml-auto font-mono text-xs text-slate-500">{item.createdAt ?? '—'}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
          <div>
            <span className="text-slate-500">id:</span>{' '}
            <span className="font-mono text-slate-200">{item.id}</span>
          </div>
          <div>
            <span className="text-slate-500">priority:</span> {item.priority}
          </div>
          <div>
            <span className="text-slate-500">agent:</span>{' '}
            <span className="font-mono text-slate-200">{item.agent}</span>
          </div>
          <div>
            <span className="text-slate-500">filename:</span>{' '}
            <span className="font-mono text-slate-200">{item.filename}</span>
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Body</h2>
        <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-200">
          {item.body || '(empty)'}
        </pre>
      </section>

      {Object.keys(item.refs ?? {}).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Refs</h2>
          <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4 font-mono text-xs text-slate-200">
            {JSON.stringify(item.refs, null, 2)}
          </pre>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Raw message</h2>
        <pre className="overflow-auto rounded-lg border border-slate-800 bg-slate-900/40 p-4 font-mono text-xs text-slate-200">
          {JSON.stringify(item.message, null, 2)}
        </pre>
      </section>
    </div>
  );
}
