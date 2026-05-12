import { IconArrowRight } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusPill from '../components/status-pill';
import { QUEUE_CARD_PREVIEW_LENGTH, QUEUE_LIST_LIMIT } from '../dashboard-rules';
import { formatRouteParticipant } from '../format';
import { useQueueStream } from '../hooks/use-queue-stream';
import { cn } from '../lib/cn';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

function filterToQueueState(filter: Filter): QueueSummary['state'] | undefined {
  return filter === 'all' ? undefined : filter;
}

function getQueuePreview(body: string): string {
  return body.split('\n')[0].slice(0, QUEUE_CARD_PREVIEW_LENGTH) || '(empty)';
}

export default function QueueList() {
  const navigate = useNavigate();
  const stream = useQueueStream();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    return api.listQueue({ state: filterToQueueState(filter), limit: QUEUE_LIST_LIMIT });
  }, [filter]);

  useEffect(() => {
    let ignoreResult = false;
    setLoading(true);

    loadQueue()
      .then((data) => {
        if (ignoreResult) return;
        setItems(data.items);
        setError(null);
      })
      .catch((e) => {
        if (!ignoreResult) setError(String(e));
      })
      .finally(() => {
        if (!ignoreResult) setLoading(false);
      });

    return () => { ignoreResult = true; };
  }, [loadQueue]);

  useEffect(() => {
    if (!stream) return;
    void loadQueue()
      .then((data) => {
        setItems(data.items);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [stream, loadQueue]);

  return (
    <div className="page">
      <header className="page-header">
        <div><div className="eyebrow">Queue</div><h1 className="title-xl">Work items</h1></div>
        <QueueFilters activeFilter={filter} onChange={setFilter} />
      </header>
      {error && <div className="alert">{error}</div>}
      {loading && <div className="empty">Loading queue…</div>}
      {!loading && !error && !items.length && <div className="empty">No queue items.</div>}
      {!loading && !!items.length && <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <QueueCard key={`${item.agent}/${item.filename}`} item={item} open={() => navigate(`/queue/${encodeURIComponent(item.id)}`)} />)}</ul>}
    </div>
  );
}

function QueueFilters({ activeFilter, onChange }: { activeFilter: Filter; onChange: (filter: Filter) => void }) {
  return (
    <div className="row-meta" aria-label="Queue filters">
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter;
        return (
          <button key={filter} type="button" className={cn('border border-ops-line px-2 py-1.5 text-xs font-bold transition dark:border-white/15', isActive ? 'bg-ops-green text-white' : 'text-ops-body hover:bg-black/5 dark:text-[#b3beb5] dark:hover:bg-white/10')} onClick={() => onChange(filter)}>
            {filter}
          </button>
        );
      })}
    </div>
  );
}

function QueueCard({ item, open }: { item: QueueSummary; open: () => void }) {
  return (
    <li><button type="button" className="card-button" onClick={open}>
      <div className="row-meta"><span className="pill pill-neutral">{item.kind}</span><StatusPill status={item.state} /><time className="caption ml-auto">{item.createdAt ?? '—'}</time></div>
      <p className="body mt-3 line-clamp-3 text-ops-ink dark:text-[#eef3ec]">{getQueuePreview(item.body)}</p>
      <div className="row-meta mt-4"><span className="caption inline-flex items-center gap-1">{formatRouteParticipant(item.from)} <IconArrowRight size={12} stroke={1.8} /> {formatRouteParticipant(item.to)}</span><span className="caption ml-auto">{item.agent}</span></div>
    </button></li>
  );
}
