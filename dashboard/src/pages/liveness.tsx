import { useEffect, useState, type ReactNode } from 'react';
import { api, type ContractBreach, type HeartbeatEntry, type HeartbeatList, type TimeoutItem } from '../api/client';
import StatusPill from '../components/status-pill';
import { Badge } from '../components/ui/badge';
import { Page, PageHeader } from '../components/ui/page';
import { DASHBOARD_POLL_INTERVAL_MS } from '../dashboard-rules';
import { useLivenessStream } from '../hooks/use-liveness-stream';

type Snapshot = {
  heartbeats: HeartbeatEntry[];
  heartbeatCounts: Record<string, number>;
  timeouts: TimeoutItem[];
  contracts: ContractBreach[];
};

const EMPTY: Snapshot = {
  heartbeats: [],
  heartbeatCounts: { fresh: 0, stale: 0, missing: 0 },
  timeouts: [],
  contracts: [],
};

async function loadSnapshot(): Promise<Snapshot> {
  const [heartbeats, timeouts, contracts] = await Promise.all([
    api.liveness.heartbeats(),
    api.liveness.timeouts(),
    api.liveness.contracts(),
  ]);

  return {
    heartbeats: heartbeats.items,
    heartbeatCounts: heartbeats.counts,
    timeouts: timeouts.items,
    contracts: contracts.items,
  };
}

function applyHeartbeatStream(previous: Snapshot, heartbeats: HeartbeatList): Snapshot {
  return {
    ...previous,
    heartbeats: heartbeats.items,
    heartbeatCounts: { ...previous.heartbeatCounts, ...heartbeats.counts },
  };
}

export default function Liveness() {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const stream = useLivenessStream();

  useEffect(() => {
    let ignoreResult = false;

    const refresh = () => {
      loadSnapshot()
        .then((nextSnapshot) => {
          if (ignoreResult) return;
          setSnapshot(nextSnapshot);
          setError(null);
        })
        .catch((e) => {
          if (!ignoreResult) setError(String(e));
        });
    };

    refresh();
    const intervalId = window.setInterval(refresh, DASHBOARD_POLL_INTERVAL_MS);
    return () => {
      ignoreResult = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!stream) return;

    setSnapshot((previous) => ({
      ...(stream.heartbeats ? applyHeartbeatStream(previous, stream.heartbeats) : previous),
      ...(stream.timeouts ? { timeouts: stream.timeouts.items } : {}),
      ...(stream.contracts ? { contracts: stream.contracts.items } : {}),
    }));
  }, [stream]);

  return (
    <Page>
      <PageHeader eyebrow="Liveness" title="Reliability checks">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['fresh', 'stale', 'missing'] as const).map((status) => (
            <StatusPill key={status} status={status}>{status} {snapshot.heartbeatCounts[status] ?? 0}</StatusPill>
          ))}
        </div>
      </PageHeader>
      {error && <div role="alert" className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      <Section title="Heartbeats" count={snapshot.heartbeats.length}>
        {snapshot.heartbeats.length ? (
          <ul className="overflow-hidden border border-ops-line bg-ops-panel shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
            {snapshot.heartbeats.map((heartbeat) => <HeartbeatRow key={`${heartbeat.agent}/${heartbeat.session}`} heartbeat={heartbeat} />)}
          </ul>
        ) : <Empty>No heartbeat files found.</Empty>}
      </Section>
      <Section title="Processing timeouts" count={snapshot.timeouts.length}>
        {snapshot.timeouts.length ? (
          <ul className="overflow-hidden border border-ops-line bg-ops-panel shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
            {snapshot.timeouts.map((item) => <TimeoutRow key={`${item.agent}/${item.messageId}/${item.file}`} item={item} />)}
          </ul>
        ) : <Empty>No stale processing items.</Empty>}
      </Section>
      <Section title="Response contract breaches" count={snapshot.contracts.length}>
        {snapshot.contracts.length ? (
          <ul className="overflow-hidden border border-ops-line bg-ops-panel shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
            {snapshot.contracts.map((item) => <ContractRow key={`${item.agent}/${item.messageId}/${item.location}`} item={item} />)}
          </ul>
        ) : <Empty>No breached response contracts.</Empty>}
      </Section>
    </Page>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">{title}</h2>
        <Badge>{count}</Badge>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">{children}</div>;
}

function HeartbeatRow({ heartbeat }: { heartbeat: HeartbeatEntry }) {
  return (
    <li className="flex gap-2 border-b border-ops-line p-3 last:border-b-0 dark:border-white/15 max-sm:block">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill status={heartbeat.status} />
          <strong className="break-all text-ops-ink dark:text-[#eef3ec]">{heartbeat.agent}</strong>
          <span className="text-[10px] text-ops-muted dark:text-[#839087]">{heartbeat.session || 'no-session'}</span>
        </div>
        <p className="mt-1 text-[10px] text-ops-muted dark:text-[#839087]">age {heartbeat.ageSeconds ?? '-'}s / timeout {heartbeat.timeoutSeconds}s</p>
      </div>
    </li>
  );
}

function TimeoutRow({ item }: { item: TimeoutItem }) {
  return (
    <li className="flex gap-2 border-b border-ops-line p-3 last:border-b-0 dark:border-white/15 max-sm:block">
      <StatusPill status="stale" />
      <div className="min-w-0 flex-1">
        <div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div>
        <p className="mt-1 text-[10px] text-ops-muted dark:text-[#839087]">age {item.ageSeconds}s / timeout {item.timeoutSeconds}s / {item.timestampSource}</p>
      </div>
    </li>
  );
}

function ContractRow({ item }: { item: ContractBreach }) {
  return (
    <li className="flex gap-2 border-b border-ops-line p-3 last:border-b-0 dark:border-white/15 max-sm:block">
      <StatusPill status="missing" />
      <div className="min-w-0 flex-1">
        <div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div>
        <p className="mt-1 text-[10px] text-ops-muted dark:text-[#839087]">expected {item.expectedSeconds}s / actual {item.actualSeconds}s / {item.location}</p>
      </div>
    </li>
  );
}
