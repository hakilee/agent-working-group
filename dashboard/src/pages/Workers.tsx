import { useEffect, useState } from 'react';
import { api, type WorkerSession } from '../api/client';
import WorkerCard from '../components/WorkerCard';

export default function Workers() {
  const [workers, setWorkers] = useState<WorkerSession[]>([]);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchWorkers = () => {
      api
        .listWorkers()
        .then((data) => {
          if (cancelled) return;
          setWorkers(data.items);
          setTmuxAvailable(data.tmuxAvailable);
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)))
        .finally(() => !cancelled && setLoading(false));
    };
    fetchWorkers();
    const id = window.setInterval(fetchWorkers, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-base)',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
        }}
      >
        <h1 className="t-display-lg" style={{ color: 'var(--color-ink)' }}>
          Workers
        </h1>
        <span
          className="t-caption-uppercase"
          style={{ color: 'var(--color-muted)' }}
        >
          tmux {tmuxAvailable ? 'available' : 'not detected'}
        </span>
      </header>

      {error && (
        <div
          role="alert"
          className="t-body-sm"
          style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-base) var(--space-lg)',
            marginBottom: 'var(--space-base)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="t-body-md" style={{ color: 'var(--color-muted)' }}>
          loading…
        </p>
      ) : workers.length === 0 ? (
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
          No tmux sessions matching{' '}
          <code className="t-code" style={{ color: 'var(--color-ink)' }}>
            awg-*
          </code>
          .
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--space-base)',
          }}
        >
          {workers.map((worker) => (
            <WorkerCard key={worker.session} worker={worker} />
          ))}
        </div>
      )}
    </>
  );
}
