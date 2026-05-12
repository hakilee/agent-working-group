import { IconArrowRight } from '@tabler/icons-react';
import { Suspense, startTransition, use, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type SystemStatus } from '../../api/client';
import ActivityItem from './_components/activity-item';
import StatsCard from './_components/stats-card';
import StatusPill from '../../components/status-pill';
import { Badge } from '../../components/ui/badge';
import { AppDialog } from '../../components/ui/app-dialog';
import { Button } from '../../components/ui/button';
import { Page } from '../../components/ui/page';
import { Text } from '../../components/ui/typography';
import { DASHBOARD_POLL_INTERVAL_MS, OVERVIEW_AGENT_LIMIT } from '../../dashboard-rules';

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
      <Badge className="max-w-full normal-case tracking-normal">{status.root}</Badge>
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
          <Text variant="eyebrow">Agent Working Group</Text>
          <Text as="h1" variant="title-lg" className="mt-3">Operations control plane</Text>
          <Text as="p" variant="body" className="mt-2 max-w-2xl">Queue health, worker liveness, and execution flow in one operational surface.</Text>
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
              <Text variant="eyebrow">Live Log</Text>
              <Text as="h2" variant="title-md">Recent activity</Text>
            </div>
            <Button type="button" size="small" onClick={() => navigate('/queue')}>
              Browse queue <IconArrowRight size={15} stroke={1.8} />
            </Button>
          </div>
          {status.recentActivity.length ? (
            <ul>{status.recentActivity.map((entry, index) => <ActivityItem key={`${entry.id ?? index}-${entry.createdAtMs ?? index}`} entry={entry} onOpen={() => setSelectedActivity(entry)} />)}</ul>
          ) : (
            <div className="m-5 border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">No recent activity in the queue log.</div>
          )}
        </div>
        <aside className="border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
          <Text variant="eyebrow">Registered Agents</Text>
          <Text as="h2" variant="title-sm" className="mt-2">Routing surface</Text>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {visibleAgents.length ? visibleAgents.map((agent) => (
              <Badge key={agent} className="normal-case tracking-normal">{agent}</Badge>
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
