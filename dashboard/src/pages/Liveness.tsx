import { useEffect, useState } from 'react';
import { api, type ContractBreach, type HeartbeatEntry, type HeartbeatList, type TimeoutItem } from '../api/client';
import StatusPill from '../components/StatusPill';
import { useLivenessStream } from '../hooks/useLivenessStream';

const POLL_INTERVAL_MS = 5000;

interface Snapshot {
  heartbeats: HeartbeatEntry[];
  heartbeatCounts: Record<string, number>;
  timeouts: TimeoutItem[];
  contracts: ContractBreach[];
}

const EMPTY: Snapshot = {
  heartbeats: [],
  heartbeatCounts: { fresh: 0, stale: 0, missing: 0 },
  timeouts: [],
  contracts: [],
};

function applyHeartbeats(prev: Snapshot, hb: HeartbeatList): Snapshot {
  return { ...prev, heartbeats: hb.items, heartbeatCounts: { ...prev.heartbeatCounts, ...hb.counts } };
}

export default function Liveness() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const stream = useLivenessStream();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([api.liveness.heartbeats(), api.liveness.timeouts(), api.liveness.contracts()])
        .then(([hb, tm, ct]) => {
          if (cancelled) return;
          setSnap({ heartbeats: hb.items, heartbeatCounts: hb.counts, timeouts: tm.items, contracts: ct.items });
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)));
    };
    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!stream) return;
    setSnap((prev) => {
      let next = prev;
      if (stream.heartbeats) next = applyHeartbeats(next, stream.heartbeats);
      if (stream.timeouts) next = { ...next, timeouts: stream.timeouts.items };
      if (stream.contracts) next = { ...next, contracts: stream.contracts.items };
      return next;
    });
  }, [stream]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Liveness</div>
          <h1 className="title-xl">Reliability checks</h1>
        </div>
        <div className="row-meta">
          {(['fresh', 'stale', 'missing'] as const).map((k) => (
            <span key={k} className={`pill ${k === 'fresh' ? 'pill-processed' : k === 'stale' ? 'pill-stale' : 'pill-dead'}`}>
              {k} {snap.heartbeatCounts[k] ?? 0}
            </span>
          ))}
        </div>
      </header>

      {error && <div role="alert" className="alert">{error}</div>}

      <Section title="Heartbeats" count={snap.heartbeats.length}>
        {snap.heartbeats.length === 0 ? <div className="empty">No heartbeat files found.</div> : (
          <ul className="panel row-list">
            {snap.heartbeats.map((hb) => (
              <li className="row-item" key={`${hb.agent}/${hb.session}`}>
                <div className="row-main">
                  <div className="row-meta">
                    <StatusPill status={hb.status} />
                    <strong className="mono" style={{ color: 'var(--color-ink)' }}>{hb.agent}</strong>
                    <span className="mono caption">{hb.session || 'no-session'}</span>
                  </div>
                  <p className="caption mono">age {hb.ageSeconds ?? '—'}s / timeout {hb.timeoutSeconds}s</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Processing timeouts" count={snap.timeouts.length}>
        {snap.timeouts.length === 0 ? <div className="empty">No stale processing items.</div> : (
          <ul className="panel row-list">
            {snap.timeouts.map((item) => <TimeoutRow key={`${item.agent}/${item.messageId}/${item.file}`} item={item} />)}
          </ul>
        )}
      </Section>

      <Section title="Response contract breaches" count={snap.contracts.length}>
        {snap.contracts.length === 0 ? <div className="empty">No breached response contracts.</div> : (
          <ul className="panel row-list">
            {snap.contracts.map((item) => <ContractRow key={`${item.agent}/${item.messageId}/${item.location}`} item={item} />)}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="grid">
      <div className="page-header">
        <h2 className="title-lg">{title}</h2>
        <span className="pill pill-neutral">{count}</span>
      </div>
      {children}
    </section>
  );
}

function TimeoutRow({ item }: { item: TimeoutItem }) {
  return (
    <li className="row-item">
      <StatusPill status="stale" />
      <div className="row-main">
        <div className="mono" style={{ color: 'var(--color-ink)' }}>{item.agent} / {item.messageId}</div>
        <p className="caption mono">age {item.ageSeconds}s / timeout {item.timeoutSeconds}s / {item.timestampSource}</p>
      </div>
    </li>
  );
}

function ContractRow({ item }: { item: ContractBreach }) {
  return (
    <li className="row-item">
      <StatusPill status="missing" />
      <div className="row-main">
        <div className="mono" style={{ color: 'var(--color-ink)' }}>{item.agent} / {item.messageId}</div>
        <p className="caption mono">expected {item.expectedSeconds}s / actual {item.actualSeconds}s / {item.location}</p>
      </div>
    </li>
  );
}
