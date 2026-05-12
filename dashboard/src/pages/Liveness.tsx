import { useEffect, useState } from 'react';
import { api, type ContractBreach, type HeartbeatEntry, type HeartbeatList, type TimeoutItem } from '../api/client';
import StatusPill from '../components/StatusPill';
import { DASHBOARD_POLL_INTERVAL_MS } from '../dashboardRules';
import { useLivenessStream } from '../hooks/useLivenessStream';

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
    <div className="page">
      <header className="page-header"><div><div className="eyebrow">Liveness</div><h1 className="title-xl">Reliability checks</h1></div><div className="row-meta">{(['fresh', 'stale', 'missing'] as const).map((status) => <StatusPill key={status} status={status}>{status} {snapshot.heartbeatCounts[status] ?? 0}</StatusPill>)}</div></header>
      {error && <div role="alert" className="alert">{error}</div>}
      <Section title="Heartbeats" count={snapshot.heartbeats.length}>{snapshot.heartbeats.length ? <ul className="panel overflow-hidden">{snapshot.heartbeats.map((heartbeat) => <HeartbeatRow key={`${heartbeat.agent}/${heartbeat.session}`} heartbeat={heartbeat} />)}</ul> : <div className="empty">No heartbeat files found.</div>}</Section>
      <Section title="Processing timeouts" count={snapshot.timeouts.length}>{snapshot.timeouts.length ? <ul className="panel overflow-hidden">{snapshot.timeouts.map((item) => <TimeoutRow key={`${item.agent}/${item.messageId}/${item.file}`} item={item} />)}</ul> : <div className="empty">No stale processing items.</div>}</Section>
      <Section title="Response contract breaches" count={snapshot.contracts.length}>{snapshot.contracts.length ? <ul className="panel overflow-hidden">{snapshot.contracts.map((item) => <ContractRow key={`${item.agent}/${item.messageId}/${item.location}`} item={item} />)}</ul> : <div className="empty">No breached response contracts.</div>}</Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="grid gap-3"><div className="page-header"><h2 className="title-lg">{title}</h2><span className="pill pill-neutral">{count}</span></div>{children}</section>;
}

function HeartbeatRow({ heartbeat }: { heartbeat: HeartbeatEntry }) {
  return <li className="row-item"><div className="min-w-0 flex-1"><div className="row-meta"><StatusPill status={heartbeat.status} /><strong className="break-all text-ops-ink dark:text-[#eef3ec]">{heartbeat.agent}</strong><span className="caption">{heartbeat.session || 'no-session'}</span></div><p className="caption mt-1">age {heartbeat.ageSeconds ?? '—'}s / timeout {heartbeat.timeoutSeconds}s</p></div></li>;
}

function TimeoutRow({ item }: { item: TimeoutItem }) {
  return <li className="row-item"><StatusPill status="stale" /><div className="min-w-0 flex-1"><div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div><p className="caption mt-1">age {item.ageSeconds}s / timeout {item.timeoutSeconds}s / {item.timestampSource}</p></div></li>;
}

function ContractRow({ item }: { item: ContractBreach }) {
  return <li className="row-item"><StatusPill status="missing" /><div className="min-w-0 flex-1"><div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div><p className="caption mt-1">expected {item.expectedSeconds}s / actual {item.actualSeconds}s / {item.location}</p></div></li>;
}
