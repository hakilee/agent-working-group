import { Suspense, startTransition, use, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SystemStatus } from '../api/client';
import ActivityItem from '../components/ActivityItem';
import StatsCard from '../components/StatsCard';
import StatusPill from '../components/StatusPill';

const STATS = [['pending', 'Pending'], ['processing', 'Processing'], ['processed', 'Completed'], ['dead', 'Failed']] as const;

function OverviewBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise), navigate = useNavigate();
  const risk = (status.counts.dead ?? 0) + (status.counts.processing ?? 0);
  const agents = useMemo(() => status.agents.slice(0, 12), [status.agents]);
  return (
    <div className="page">
      <section className="panel relative grid min-h-72 overflow-hidden p-7">
        <div className="absolute -bottom-28 left-1/3 h-64 w-3/4 -rotate-6 rounded-full bg-gradient-to-r from-emerald-500/20 via-orange-400/25 to-blue-500/20 blur-sm" />
        <div className="relative z-10 self-start">
          <div className="eyebrow">Agent Working Group</div>
          <h1 className="title-xl mt-3">Operations control plane</h1>
          <p className="body mt-5 max-w-2xl">Queue health, worker liveness, and execution flow in one operational surface.</p>
        </div>
        <div className="row-meta relative z-10 self-end pt-8">
          <span className="pill pill-neutral max-w-full normal-case tracking-normal">{status.root}</span>
          <StatusPill status="processed" className="normal-case tracking-normal">{status.totalQueueItems} queue items</StatusPill>
          <StatusPill status={risk ? 'stale' : 'processed'}>{risk ? `${risk} needs attention` : 'stable'}</StatusPill>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {STATS.map(([key, label]) => <StatsCard key={key} label={label} value={status.counts[key] ?? 0} />)}
        <StatsCard label="Workers" value={status.workers.total} hint={`${status.workers.attached} attached`} />
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1.4fr_.6fr]">
        <div className="panel overflow-hidden">
          <div className="page-header p-5 md:p-6">
            <div><div className="eyebrow">Live Log</div><h2 className="title-lg">Recent activity</h2></div>
            <button type="button" className="action-btn" onClick={() => navigate('/queue')}>Browse queue →</button>
          </div>
          {status.recentActivity.length ? <ul>{status.recentActivity.map((e, i) => <ActivityItem key={`${e.id ?? i}-${e.createdAtMs ?? i}`} entry={e} />)}</ul> : <div className="empty m-5">No recent activity in the queue log.</div>}
        </div>
        <aside className="panel panel-pad">
          <div className="eyebrow">Registered Agents</div>
          <h2 className="title-md mt-2">Routing surface</h2>
          <div className="row-meta mt-5">{agents.length ? agents.map((a) => <span key={a} className="pill pill-neutral normal-case tracking-normal">{a}</span>) : <span className="caption">No agents registered.</span>}</div>
        </aside>
      </section>
    </div>
  );
}

export default function Overview() {
  const [promise, setPromise] = useState(() => api.status());
  useEffect(() => { const id = window.setInterval(() => startTransition(() => setPromise(api.status())), 5000); return () => window.clearInterval(id); }, []);
  return <Suspense fallback={<div className="page"><div className="panel panel-pad"><div className="eyebrow">Loading</div><h1 className="title-lg">Preparing dashboard…</h1></div></div>}><OverviewBody statusPromise={promise} /></Suspense>;
}
