import { useEffect, useState } from 'react';
import { api, type ContractBreach, type HeartbeatEntry, type HeartbeatList, type TimeoutItem } from '../api/client';
import StatusPill from '../components/StatusPill';
import { useLivenessStream } from '../hooks/useLivenessStream';

type Snapshot = { heartbeats: HeartbeatEntry[]; heartbeatCounts: Record<string, number>; timeouts: TimeoutItem[]; contracts: ContractBreach[] };
const EMPTY: Snapshot = { heartbeats: [], heartbeatCounts: { fresh: 0, stale: 0, missing: 0 }, timeouts: [], contracts: [] };
const applyHeartbeats = (p: Snapshot, hb: HeartbeatList): Snapshot => ({ ...p, heartbeats: hb.items, heartbeatCounts: { ...p.heartbeatCounts, ...hb.counts } });

export default function Liveness() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY), [error, setError] = useState<string | null>(null);
  const stream = useLivenessStream();
  useEffect(() => { let off = false; const load = () => Promise.all([api.liveness.heartbeats(), api.liveness.timeouts(), api.liveness.contracts()]).then(([hb, tm, ct]) => !off && (setSnap({ heartbeats: hb.items, heartbeatCounts: hb.counts, timeouts: tm.items, contracts: ct.items }), setError(null))).catch((e) => !off && setError(String(e))); load(); const id = window.setInterval(load, 5000); return () => { off = true; window.clearInterval(id); }; }, []);
  useEffect(() => { if (stream) setSnap((p) => ({ ...(stream.heartbeats ? applyHeartbeats(p, stream.heartbeats) : p), ...(stream.timeouts ? { timeouts: stream.timeouts.items } : {}), ...(stream.contracts ? { contracts: stream.contracts.items } : {}) })); }, [stream]);
  return (
    <div className="page">
      <header className="page-header"><div><div className="eyebrow">Liveness</div><h1 className="title-xl">Reliability checks</h1></div><div className="row-meta">{(['fresh', 'stale', 'missing'] as const).map((k) => <StatusPill key={k} status={k}>{k} {snap.heartbeatCounts[k] ?? 0}</StatusPill>)}</div></header>
      {error && <div role="alert" className="alert">{error}</div>}
      <Section title="Heartbeats" count={snap.heartbeats.length}>{snap.heartbeats.length ? <ul className="panel overflow-hidden">{snap.heartbeats.map((hb) => <HeartbeatRow key={`${hb.agent}/${hb.session}`} hb={hb} />)}</ul> : <div className="empty">No heartbeat files found.</div>}</Section>
      <Section title="Processing timeouts" count={snap.timeouts.length}>{snap.timeouts.length ? <ul className="panel overflow-hidden">{snap.timeouts.map((i) => <TimeoutRow key={`${i.agent}/${i.messageId}/${i.file}`} item={i} />)}</ul> : <div className="empty">No stale processing items.</div>}</Section>
      <Section title="Response contract breaches" count={snap.contracts.length}>{snap.contracts.length ? <ul className="panel overflow-hidden">{snap.contracts.map((i) => <ContractRow key={`${i.agent}/${i.messageId}/${i.location}`} item={i} />)}</ul> : <div className="empty">No breached response contracts.</div>}</Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="grid gap-3"><div className="page-header"><h2 className="title-lg">{title}</h2><span className="pill pill-neutral">{count}</span></div>{children}</section>;
}
function HeartbeatRow({ hb }: { hb: HeartbeatEntry }) {
  return <li className="row-item"><div className="min-w-0 flex-1"><div className="row-meta"><StatusPill status={hb.status} /><strong className="break-all text-ops-ink dark:text-[#eef3ec]">{hb.agent}</strong><span className="caption">{hb.session || 'no-session'}</span></div><p className="caption mt-1">age {hb.ageSeconds ?? '—'}s / timeout {hb.timeoutSeconds}s</p></div></li>;
}
function TimeoutRow({ item }: { item: TimeoutItem }) {
  return <li className="row-item"><StatusPill status="stale" /><div className="min-w-0 flex-1"><div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div><p className="caption mt-1">age {item.ageSeconds}s / timeout {item.timeoutSeconds}s / {item.timestampSource}</p></div></li>;
}
function ContractRow({ item }: { item: ContractBreach }) {
  return <li className="row-item"><StatusPill status="missing" /><div className="min-w-0 flex-1"><div className="break-all text-ops-ink dark:text-[#eef3ec]">{item.agent} / {item.messageId}</div><p className="caption mt-1">expected {item.expectedSeconds}s / actual {item.actualSeconds}s / {item.location}</p></div></li>;
}
