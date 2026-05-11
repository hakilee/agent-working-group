import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useActivityParams, type ActivityComponentType } from '@stackflow/react';
import { api, type QueueDetail } from '../api/client';
import StatusBadge from '../components/StatusBadge';

interface Params {
  id: string;
}

const QueueDetailPage: ActivityComponentType<Params> = () => {
  const { id = '' } = useActivityParams<Params>();
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

  return (
    <AppScreen appBar={{ title: 'Message', backButton: { ariaLabel: 'Back' } }}>
      <div className="app-screen app-screen--no-pad-bottom">
        {error && <div className="alert-error">{error}</div>}
        {!error && !item && <div className="muted">loading…</div>}
        {item && (
          <div className="stack-lg">
            <div className="row-between">
              <span className="dim font-mono" style={{ fontSize: 11 }}>
                {item.id}
              </span>
              <StatusBadge status={item.state} />
            </div>

            <header className="card">
              <div className="row" style={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="feed-kind">{item.kind}</span>
                <span className="feed-from font-mono">{item.from ?? '?'}</span>
                <span className="feed-arrow">→</span>
                <span className="feed-to font-mono">{item.to ?? '?'}</span>
                <span
                  className="font-mono dim"
                  style={{ fontSize: 11, marginLeft: 'auto' }}
                >
                  {item.createdAt ?? '—'}
                </span>
              </div>
              <div className="kv-grid" style={{ marginTop: 12 }}>
                <div>
                  <span className="dim">priority:</span>{' '}
                  <span style={{ color: 'var(--app-fg)' }}>{item.priority}</span>
                </div>
                <div>
                  <span className="dim">agent:</span>{' '}
                  <span className="font-mono" style={{ color: 'var(--app-fg)' }}>
                    {item.agent}
                  </span>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span className="dim">filename:</span>{' '}
                  <span className="font-mono" style={{ color: 'var(--app-fg)' }}>
                    {item.filename}
                  </span>
                </div>
              </div>
            </header>

            <section>
              <h2 className="section-title">Body</h2>
              <pre className="json-block">{item.body || '(empty)'}</pre>
            </section>

            {Object.keys(item.refs ?? {}).length > 0 && (
              <section>
                <h2 className="section-title">Refs</h2>
                <pre className="json-block">{JSON.stringify(item.refs, null, 2)}</pre>
              </section>
            )}

            <section>
              <h2 className="section-title">Raw message</h2>
              <pre className="json-block">{JSON.stringify(item.message, null, 2)}</pre>
            </section>
          </div>
        )}
      </div>
    </AppScreen>
  );
};

export default QueueDetailPage;
