import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusPill from '../components/StatusPill';
import { cn } from '../lib/cn';
import { useQueueStream } from '../hooks/useQueueStream';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

export default function QueueList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all'), [items, setItems] = useState<QueueSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const stream = useQueueStream();
  useEffect(() => { let off = false; setLoading(true); api.listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 }).then((d) => !off && (setItems(d.items), setError(null))).catch((e) => !off && setError(String(e))).finally(() => !off && setLoading(false)); return () => { off = true; }; }, [filter]);
  useEffect(() => { if (stream) api.listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 }).then((d) => (setItems(d.items), setError(null))).catch((e) => setError(String(e))); }, [stream, filter]);
  return (
    <div className="page">
      <header className="page-header">
        <div><div className="eyebrow">Queue</div><h1 className="title-xl">Work items</h1></div>
        <div className="row-meta" aria-label="Queue filters">{FILTERS.map((f) => <button key={f} type="button" className={cn('border border-ops-line px-2 py-1.5 text-xs font-bold transition dark:border-white/15', filter === f ? 'bg-ops-green text-white' : 'text-ops-body hover:bg-black/5 dark:text-[#b3beb5] dark:hover:bg-white/10')} onClick={() => setFilter(f)}>{f}</button>)}</div>
      </header>
      {error && <div className="alert">{error}</div>}
      {loading && <div className="empty">Loading queue…</div>}
      {!loading && !error && !items.length && <div className="empty">No queue items.</div>}
      {!loading && !!items.length && <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <QueueCard key={`${item.agent}/${item.filename}`} item={item} open={() => navigate(`/queue/${encodeURIComponent(item.id)}`)} />)}</ul>}
    </div>
  );
}

function QueueCard({ item, open }: { item: QueueSummary; open: () => void }) {
  return (
    <li><button type="button" className="card-button" onClick={open}>
      <div className="row-meta"><span className="pill pill-neutral">{item.kind}</span><StatusPill status={item.state} /><time className="caption ml-auto">{item.createdAt ?? '—'}</time></div>
      <p className="body mt-3 line-clamp-3 text-ops-ink dark:text-[#eef3ec]">{item.body.split('\n')[0].slice(0, 132) || '(empty)'}</p>
      <div className="row-meta mt-4"><span className="caption">{item.from ?? '?'} → {item.to ?? '?'}</span><span className="caption ml-auto">{item.agent}</span></div>
    </button></li>
  );
}
