import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusPill from '../components/StatusPill';
import { useQueueStream } from '../hooks/useQueueStream';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

function FilterTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="t-button"
      style={{
        padding: '8px 0',
        marginRight: 'var(--space-lg)',
        color: active ? 'var(--color-ink)' : 'var(--color-muted)',
        borderBottom: `2px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
        transition: 'color 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

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
    return () => {
      cancelled = true;
    };
  }, [filter]);

  useEffect(() => {
    if (!stream) return;
    api
      .listQueue({ state: filter === 'all' ? undefined : filter, limit: 500 })
      .then((data) => {
        setItems(data.items);
        setError(null);
      })
      .catch((err) => setError(String(err)));
  }, [stream, filter]);

  return (
    <>
      <header style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 className="t-display-lg" style={{ color: 'var(--color-ink)' }}>
          Queue
        </h1>
      </header>

      <div
        style={{
          borderBottom: '1px solid var(--color-hairline)',
          marginBottom: 'var(--space-lg)',
          display: 'flex',
          flexWrap: 'wrap',
        }}
      >
        {FILTERS.map((value) => (
          <FilterTab
            key={value}
            label={value}
            active={filter === value}
            onClick={() => setFilter(value)}
          />
        ))}
      </div>

      {error && <ErrorBlock message={error} />}

      {loading && (
        <p className="t-body-md" style={{ color: 'var(--color-muted)' }}>
          loading…
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState text="No queue items." />
      )}

      {!loading && items.length > 0 && (
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-sm)',
          }}
        >
          {items.map((item) => (
            <li key={`${item.agent}/${item.filename}`}>
              <button
                type="button"
                onClick={() => navigate(`/queue/${encodeURIComponent(item.id)}`)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-hairline)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-xs)',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-hairline-strong)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-hairline)';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    className="t-caption-uppercase"
                    style={{
                      background: 'var(--color-surface-strong)',
                      color: 'var(--color-ink)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {item.kind}
                  </span>
                  <StatusPill status={item.state} />
                  <span
                    className="t-code"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {item.from ?? '?'} → {item.to ?? '?'}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      marginLeft: 'auto',
                      color: 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {item.createdAt ?? '—'}
                  </span>
                </div>
                <div
                  className="t-body-md"
                  style={{
                    color: 'var(--color-body)',
                    wordBreak: 'break-word',
                  }}
                >
                  {item.body.split('\n')[0].slice(0, 96) || '(empty)'}
                </div>
                <div
                  className="t-code"
                  style={{ color: 'var(--color-muted-soft)' }}
                >
                  {item.agent}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-error)',
        color: 'var(--color-error)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-base) var(--space-lg)',
        marginBottom: 'var(--space-base)',
      }}
      className="t-body-sm"
    >
      {message}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="t-body-md"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px dashed var(--color-hairline-strong)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-xl)',
        textAlign: 'center',
        color: 'var(--color-muted)',
      }}
    >
      {text}
    </div>
  );
}
