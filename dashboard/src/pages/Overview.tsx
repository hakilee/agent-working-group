import { Suspense, startTransition, use, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SystemStatus } from '../api/client';
import StatsCard from '../components/StatsCard';
import ActivityItem from '../components/ActivityItem';

const STATS: Array<{ key: string; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'processed', label: 'Completed' },
  { key: 'dead', label: 'Failed' },
];

function PageHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header style={{ marginBottom: 'var(--space-xl)' }}>
      <h1 className="t-display-lg" style={{ color: 'var(--color-ink)' }}>
        Overview
      </h1>
      {subtitle && (
        <p
          className="t-body-md"
          style={{ color: 'var(--color-muted)', marginTop: 'var(--space-xs)' }}
        >
          {subtitle}
        </p>
      )}
    </header>
  );
}

function OverviewBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const navigate = useNavigate();
  return (
    <>
      <PageHeader subtitle={status.root} />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 'var(--space-base)',
          marginBottom: 'var(--space-xl)',
        }}
      >
        {STATS.map((s) => (
          <StatsCard
            key={s.key}
            label={s.label}
            value={status.counts[s.key] ?? 0}
          />
        ))}
        <StatsCard
          label="Workers"
          value={status.workers.total}
          hint={`${status.workers.attached} attached`}
        />
      </section>

      <section style={{ marginBottom: 'var(--space-xl)' }}>
        <h2
          className="t-display-md"
          style={{ color: 'var(--color-ink)', marginBottom: 'var(--space-base)' }}
        >
          Agents
        </h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-xs)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-lg)',
          }}
        >
          {status.agents.length ? (
            status.agents.map((agent) => (
              <span
                key={agent}
                className="t-caption-uppercase"
                style={{
                  background: 'var(--color-surface-strong)',
                  color: 'var(--color-ink)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: 0,
                  textTransform: 'none',
                  fontSize: 12,
                }}
              >
                {agent}
              </span>
            ))
          ) : (
            <span
              className="t-body-sm"
              style={{ color: 'var(--color-muted)' }}
            >
              no agents registered
            </span>
          )}
        </div>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 'var(--space-base)',
          }}
        >
          <h2 className="t-display-md" style={{ color: 'var(--color-ink)' }}>
            Recent activity
          </h2>
          <button
            type="button"
            className="t-button"
            onClick={() => navigate('/queue')}
            style={{
              color: 'var(--color-ink)',
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            Browse queue →
          </button>
        </div>
        {status.recentActivity.length === 0 ? (
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px dashed var(--color-hairline-strong)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-xl)',
              textAlign: 'center',
              color: 'var(--color-muted)',
            }}
            className="t-body-md"
          >
            No recent activity in the queue log.
          </div>
        ) : (
          <ul
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-hairline)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {status.recentActivity.map((entry, idx) => (
              <ActivityItem
                key={`${entry.id ?? idx}-${entry.createdAtMs ?? idx}`}
                entry={entry}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Fallback() {
  return (
    <>
      <PageHeader />
      <p className="t-body-md" style={{ color: 'var(--color-muted)' }}>
        Loading overview…
      </p>
    </>
  );
}

export default function Overview() {
  const [promise, setPromise] = useState(() => api.status());

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => setPromise(api.status()));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Suspense fallback={<Fallback />}>
      <OverviewBody statusPromise={promise} />
    </Suspense>
  );
}
