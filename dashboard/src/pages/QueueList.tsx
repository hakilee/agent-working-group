import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusPill from '../components/StatusPill';
import { useQueueStream } from '../hooks/useQueueStream';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

export default function QueueList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stream = useQueueStream();

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
    return () => { cancelled = true; };
  }, [filter]);

  useEffect(() => {
    if (!stream) return;
    api
      .listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 })
      .then((data) => { setItems(data.items); setError(null); })
      .catch((err) => setError(String(err)));
  }, [stream, filter]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Queue</div>
          <h1 className="title-xl">Work items</h1>
        </div>
        <div className="filter-bar" aria-label="Queue filters">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-btn${filter === value ? ' active' : ''}`}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="alert">{error}</div>}
      {loading && <div className="empty">Loading queue…</div>}
      {!loading && !error && items.length === 0 && <div className="empty">No queue items.</div>}

      {!loading && items.length > 0 && (
        <ul className="grid queue-grid">
          {items.map((item) => (
            <li key={`${item.agent}/${item.filename}`}>
              <button type="button" className="card-button" onClick={() => navigate(`/queue/${encodeURIComponent(item.id)}`)}>
                <div className="row-meta">
                  <span className="pill pill-neutral">{item.kind}</span>
                  <StatusPill status={item.state} />
                  <time className="mono caption" style={{ marginLeft: 'auto' }}>{item.createdAt ?? '—'}</time>
                </div>
                <p className="body" style={{ marginTop: 12, color: 'var(--color-ink)' }}>
                  {item.body.split('\n')[0].slice(0, 132) || '(empty)'}
                </p>
                <div className="row-meta" style={{ marginTop: 16 }}>
                  <span className="mono caption">{item.from ?? '?'} → {item.to ?? '?'}</span>
                  <span className="mono caption" style={{ marginLeft: 'auto' }}>{item.agent}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
