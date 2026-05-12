import { Suspense, startTransition, use, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SystemStatus } from '../api/client';
import ActivityItem from '../components/ActivityItem';
import StatsCard from '../components/StatsCard';
import StatusPill from '../components/StatusPill';
import { DASHBOARD_POLL_INTERVAL_MS, OVERVIEW_AGENT_LIMIT } from '../dashboardRules';

const STATS = [['pending', 'Pending'], ['processing', 'Processing'], ['processed', 'Completed'], ['dead', 'Failed']] as const;

function countItemsNeedingAttention(status: SystemStatus): number {
  return (status.counts.dead ?? 0) + (status.counts.processing ?? 0);
}

function getVisibleAgents(status: SystemStatus): string[] {
  return status.agents.slice(0, OVERVIEW_AGENT_LIMIT);
}

function OverviewBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const navigate = useNavigate();
  const itemsNeedingAttention = countItemsNeedingAttention(status);
  const visibleAgents = useMemo(() => getVisibleAgents(status), [status]);

  return (
    <div className="page">
      <section className="panel relative grid min-h-40 overflow-hidden p-4">
        <div className="absolute -bottom-24 left-1/3 h-40 w-3/4 -rotate-6 bg-gradient-to-r from-emerald-500/14 via-orange-400/16 to-blue-500/14 blur-sm" />
        <div className="relative z-10 self-start">
          <div className="eyebrow">Agent Working Group</div>
          <h1 className="title-xl mt-3">Operations control plane</h1>
          <p className="body mt-2 max-w-2xl">Queue health, worker liveness, and execution flow in one operational surface.</p>
        </div>
        <div className="row-meta relative z-10 self-end pt-4">
          <span className="pill pill-neutral max-w-full normal-case tracking-normal">{status.root}</span>
          <StatusPill status="processed" className="normal-case tracking-normal">{status.totalQueueItems} queue items</StatusPill>
          <StatusPill status={itemsNeedingAttention ? 'stale' : 'processed'}>{itemsNeedingAttention ? `${itemsNeedingAttention} needs attention` : 'stable'}</StatusPill>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STATS.map(([key, label]) => <StatsCard key={key} label={label} value={status.counts[key] ?? 0} />)}
        <StatsCard label="Workers" value={status.workers.total} hint={`${status.workers.attached} attached`} />
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[1.4fr_.6fr]">
        <div className="panel overflow-hidden">
          <div className="page-header p-3 md:p-4">
            <div><div className="eyebrow">Live Log</div><h2 className="title-lg">Recent activity</h2></div>
            <button type="button" className="action-btn" onClick={() => navigate('/queue')}>Browse queue →</button>
          </div>
          {status.recentActivity.length ? <ul>{status.recentActivity.map((entry, index) => <ActivityItem key={`${entry.id ?? index}-${entry.createdAtMs ?? index}`} entry={entry} />)}</ul> : <div className="empty m-5">No recent activity in the queue log.</div>}
        </div>
        <aside className="panel panel-pad">
          <div className="eyebrow">Registered Agents</div>
          <h2 className="title-md mt-2">Routing surface</h2>
          <div className="row-meta mt-3">{visibleAgents.length ? visibleAgents.map((agent) => <span key={agent} className="pill pill-neutral normal-case tracking-normal">{agent}</span>) : <span className="caption">No agents registered.</span>}</div>
        </aside>
      </section>
    </div>
  );
}

export default function Overview() {
  const [statusPromise, setStatusPromise] = useState(() => api.status());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(() => setStatusPromise(api.status()));
    }, DASHBOARD_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <Suspense fallback={<div className="page"><div className="panel panel-pad"><div className="eyebrow">Loading</div><h1 className="title-lg">Preparing dashboard…</h1></div></div>}>
      <OverviewBody statusPromise={statusPromise} />
    </Suspense>
  );
}
