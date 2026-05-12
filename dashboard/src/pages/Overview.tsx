import { Suspense, startTransition, use, useEffect, useMemo, useState } from 'react';
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

function OverviewBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const navigate = useNavigate();
  const risk = (status.counts.dead ?? 0) + (status.counts.processing ?? 0);
  const activeAgents = useMemo(() => status.agents.slice(0, 12), [status.agents]);

  return (
    <div className="page">
      <section className="panel hero-card">
        <div>
          <div className="eyebrow">Agent Working Group</div>
          <h1 className="title-xl" style={{ marginTop: 12 }}>Operations control plane</h1>
          <p className="body" style={{ maxWidth: 680, marginTop: 18 }}>
            Queue health, worker liveness, and execution flow in one operational surface.
          </p>
        </div>
        <div className="row-meta" style={{ marginTop: 28 }}>
          <span className="pill pill-neutral mono">{status.root}</span>
          <span className="pill pill-processed">{status.totalQueueItems} queue items</span>
          <span className={risk ? 'pill pill-stale' : 'pill pill-processed'}>{risk ? `${risk} needs attention` : 'stable'}</span>
        </div>
      </section>

      <section className="grid stats-grid">
        {STATS.map((s) => <StatsCard key={s.key} label={s.label} value={status.counts[s.key] ?? 0} />)}
        <StatsCard label="Workers" value={status.workers.total} hint={`${status.workers.attached} attached`} />
      </section>

      <section className="grid content-grid">
        <div className="panel row-list">
          <div className="panel-pad page-header">
            <div>
              <div className="eyebrow">Live Log</div>
              <h2 className="title-lg">Recent activity</h2>
            </div>
            <button type="button" className="action-btn" onClick={() => navigate('/queue')}>Browse queue →</button>
          </div>
          {status.recentActivity.length === 0 ? (
            <div className="empty" style={{ margin: 18 }}>No recent activity in the queue log.</div>
          ) : (
            <ul>
              {status.recentActivity.map((entry, idx) => (
                <ActivityItem key={`${entry.id ?? idx}-${entry.createdAtMs ?? idx}`} entry={entry} />
              ))}
            </ul>
          )}
        </div>

        <aside className="panel panel-pad">
          <div className="eyebrow">Registered Agents</div>
          <h2 className="title-md" style={{ marginTop: 8 }}>Routing surface</h2>
          <div className="row-meta" style={{ marginTop: 18 }}>
            {activeAgents.length ? activeAgents.map((agent) => (
              <span key={agent} className="pill pill-neutral mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{agent}</span>
            )) : <span className="caption">No agents registered.</span>}
          </div>
        </aside>
      </section>
    </div>
  );
}

function Fallback() {
  return (
    <div className="page">
      <div className="panel panel-pad">
        <div className="eyebrow">Loading</div>
        <h1 className="title-lg">Preparing dashboard…</h1>
      </div>
    </div>
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
