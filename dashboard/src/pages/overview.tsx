import { IconArrowRight } from '@tabler/icons-react';
import { Suspense, startTransition, use, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SystemStatus } from '../api/client';
import ActivityItem from '../components/activity-item';
import StatsCard from '../components/stats-card';
import StatusPill from '../components/status-pill';
import { AppDialog } from '../components/ui/app-dialog';
import { Page } from '../components/ui/page';
import { DASHBOARD_POLL_INTERVAL_MS, OVERVIEW_AGENT_LIMIT } from '../dashboard-rules';

const STATS = [['pending', 'Pending'], ['processing', 'Processing'], ['processed', 'Completed'], ['dead', 'Failed']] as const;
type ActivityEntry = SystemStatus['recentActivity'][number];

function getVisibleAgents(status: SystemStatus): string[] {
  return status.agents.slice(0, OVERVIEW_AGENT_LIMIT);
}

function getRootStatus(status: SystemStatus): 'processed' | 'stale' | 'dead' {
  if (!status.queuePathExists) return 'dead';
  return status.isTmpRoot ? 'stale' : 'processed';
}

function RootSummary({ status }: { status: SystemStatus }) {
  return (
    <div className="relative z-10 flex flex-wrap items-center gap-1.5 self-end pt-4">
      <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap border border-transparent bg-[#ebe6da] px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]">{status.root}</span>
      <StatusPill status={getRootStatus(status)} className="normal-case tracking-normal">
        {status.rootSource} root{status.isTmpRoot ? ' / tmp' : ''}
      </StatusPill>
      <StatusPill status="processed" className="normal-case tracking-normal">{status.totalQueueItems} queue items</StatusPill>
    </div>
  );
}

function ActivityDialog({ entry, onClose }: { entry: ActivityEntry; onClose: () => void }) {
  return (
    <AppDialog open={Boolean(entry)} onOpenChange={(open) => { if (!open) onClose(); }} title="Live log detail" description={entry.createdAt ?? 'No timestamp'}>
      <dl className="grid gap-2 text-xs">
        {[["id", entry.id], ["kind", entry.kind], ["from", entry.from], ["to", entry.to]].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[80px_1fr] gap-2 border-b border-ops-line pb-2 last:border-b-0 dark:border-white/15">
            <dt className="text-[10px] uppercase text-ops-muted dark:text-[#839087]">{label}</dt>
            <dd className="break-all text-ops-ink dark:text-[#eef3ec]">{value ?? '-'}</dd>
          </div>
        ))}
      </dl>
      <pre className="max-h-[46dvh] overflow-auto whitespace-pre-wrap break-words border border-ops-line bg-white/75 p-3 font-mono text-[11px] leading-5 text-ops-ink dark:border-white/15 dark:bg-black/25 dark:text-[#eef3ec]">{entry.body || '(empty)'}</pre>
    </AppDialog>
  );
}

function OverviewBody({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const navigate = useNavigate();
  const visibleAgents = useMemo(() => getVisibleAgents(status), [status]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);

  return (
    <Page>
      <section className="relative grid min-h-40 overflow-hidden border border-ops-line bg-ops-panel p-4 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
        <div className="absolute -bottom-24 left-1/3 h-40 w-3/4 -rotate-6 bg-gradient-to-r from-emerald-500/14 via-orange-400/16 to-blue-500/14 blur-sm" />
        <div className="relative z-10 self-start">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Agent Working Group</div>
          <h1 className="mt-3 text-xl font-bold leading-tight tracking-[-.035em] text-ops-ink dark:text-[#eef3ec] md:text-2xl">Operations control plane</h1>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-ops-body dark:text-[#b3beb5]">Queue health, worker liveness, and execution flow in one operational surface.</p>
        </div>
        <RootSummary status={status} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STATS.map(([key, label]) => <StatsCard key={key} label={label} value={status.counts[key] ?? 0} />)}
        <StatsCard label="Workers" value={status.workers.total} hint={`${status.workers.attached} attached`} />
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[1.4fr_.6fr]">
        <div className="overflow-hidden border border-ops-line bg-ops-panel shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
          <div className="flex flex-wrap items-end justify-between gap-3 p-3 md:p-4">
            <div className="grid gap-1.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Live Log</div>
              <h2 className="text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">Recent activity</h2>
            </div>
            <button type="button" className="inline-flex items-center gap-1.5 border border-transparent bg-[#ebe6da] px-2.5 py-1.5 text-xs font-bold text-ops-ink transition hover:border-ops-line hover:bg-emerald-50 dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15" onClick={() => navigate('/queue')}>
              Browse queue <IconArrowRight size={15} stroke={1.8} />
            </button>
          </div>
          {status.recentActivity.length ? (
            <ul>{status.recentActivity.map((entry, index) => <ActivityItem key={`${entry.id ?? index}-${entry.createdAtMs ?? index}`} entry={entry} onOpen={() => setSelectedActivity(entry)} />)}</ul>
          ) : (
            <div className="m-5 border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">No recent activity in the queue log.</div>
          )}
        </div>
        <aside className="border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Registered Agents</div>
          <h2 className="mt-2 text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]">Routing surface</h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {visibleAgents.length ? visibleAgents.map((agent) => (
              <span key={agent} className="inline-flex items-center gap-1 whitespace-nowrap border border-transparent bg-[#ebe6da] px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]">{agent}</span>
            )) : <span className="text-[10px] text-ops-muted dark:text-[#839087]">No agents registered.</span>}
          </div>
        </aside>
      </section>
      {selectedActivity && <ActivityDialog entry={selectedActivity} onClose={() => setSelectedActivity(null)} />}
    </Page>
  );
}

function OverviewLoading() {
  return (
    <Page>
      <div className="grid min-h-40 place-items-center" aria-label="Loading dashboard">
        <div className="size-5 animate-spin border-2 border-ops-line border-t-ops-green dark:border-white/15 dark:border-t-emerald-300 [border-radius:9999px]" aria-hidden="true" />
      </div>
    </Page>
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
    <Suspense fallback={<OverviewLoading />}>
      <OverviewBody statusPromise={statusPromise} />
    </Suspense>
  );
}
