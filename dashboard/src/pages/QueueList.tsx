import { useEffect, useMemo, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import { api, type QueueSummary } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import BottomTabs from '../components/BottomTabs';
import { useQueueStream } from '../hooks/useQueueStream';
import { useFlow } from '../stackflow';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

const QueueList: ActivityComponentType = () => {
  const flow = useFlow();
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

  const grouped = useMemo(() => items, [items]);

  return (
    <AppScreen appBar={{ title: 'Queue' }}>
      <div className="app-screen">
        <div className="stack-lg">
          <div className="row-between">
            <h1 className="h1">Queue</h1>
            <div className="filter-row">
              {FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className="filter-pill"
                  aria-pressed={filter === value}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>state</th>
                  <th>kind</th>
                  <th>agent</th>
                  <th>from → to</th>
                  <th>body</th>
                  <th>created</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr className="empty-row">
                    <td colSpan={6}>loading…</td>
                  </tr>
                )}
                {!loading && grouped.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={6}>no items</td>
                  </tr>
                )}
                {grouped.map((item) => (
                  <tr key={`${item.agent}/${item.filename}`}>
                    <td>
                      <StatusBadge status={item.state} />
                    </td>
                    <td className="font-mono dim" style={{ fontSize: 11 }}>
                      {item.kind}
                    </td>
                    <td className="font-mono dim" style={{ fontSize: 11 }}>
                      {item.agent}
                    </td>
                    <td className="font-mono muted" style={{ fontSize: 11 }}>
                      {item.from ?? '?'} → {item.to ?? '?'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-inline"
                        onClick={() => flow.push('QueueDetail', { id: item.id })}
                      >
                        {item.body.split('\n')[0].slice(0, 96) || '(empty)'}
                      </button>
                    </td>
                    <td className="font-mono dim" style={{ fontSize: 11 }}>
                      {item.createdAt ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <BottomTabs />
    </AppScreen>
  );
};

export default QueueList;
