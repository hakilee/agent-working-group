import { useEffect, useState } from 'react';
import {
  api,
  type ContractBreach,
  type HeartbeatEntry,
  type HeartbeatList,
  type TimeoutItem,
} from '../api/client';
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
  return {
    ...prev,
    heartbeats: hb.items,
    heartbeatCounts: { ...prev.heartbeatCounts, ...hb.counts },
  };
}

function dotColor(status: string): string {
  if (status === 'fresh') return 'var(--color-success)';
  if (status === 'stale') return 'var(--color-timeline-done)';
  return 'var(--color-error)';
}

function SectionHeader({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <h2
      className="t-display-md"
      style={{
        color: 'var(--color-ink)',
        marginBottom: 'var(--space-base)',
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-xs)',
      }}
    >
      {title}
      {count !== undefined && (
        <span
          className="t-caption-uppercase"
          style={{ color: 'var(--color-muted)' }}
        >
          {count}
        </span>
      )}
    </h2>
  );
}

function ListShell({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {children}
    </ul>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <li
      style={{
        padding: 'var(--space-sm) var(--space-lg)',
        borderBottom: '1px solid var(--color-hairline-soft)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-base)',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </li>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      className="t-body-md"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px dashed var(--color-hairline-strong)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        textAlign: 'center',
        color: 'var(--color-muted)',
      }}
    >
      {text}
    </div>
  );
}

export default function Liveness() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const stream = useLivenessStream();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([
        api.liveness.heartbeats(),
        api.liveness.timeouts(),
        api.liveness.contracts(),
      ])
        .then(([hb, tm, ct]) => {
          if (cancelled) return;
          setSnap({
            heartbeats: hb.items,
            heartbeatCounts: hb.counts,
            timeouts: tm.items,
            contracts: ct.items,
          });
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)));
    };
    load();
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
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
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-base)',
          marginBottom: 'var(--space-xl)',
          flexWrap: 'wrap',
        }}
      >
        <h1 className="t-display-lg" style={{ color: 'var(--color-ink)' }}>
          Liveness
        </h1>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-base)',
            flexWrap: 'wrap',
          }}
        >
          {(['fresh', 'stale', 'missing'] as const).map((k) => (
            <span
              key={k}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-xs)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-pill)',
                  background: dotColor(k),
                }}
              />
              <span
                className="t-caption-uppercase"
                style={{ color: 'var(--color-muted)' }}
              >
                {k}
              </span>
              <span
                className="t-body-sm"
                style={{
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {snap.heartbeatCounts[k] ?? 0}
              </span>
            </span>
          ))}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="t-body-sm"
          style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-base) var(--space-lg)',
            marginBottom: 'var(--space-base)',
          }}
        >
          {error}
        </div>
      )}

      <section style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionHeader title="Heartbeats" />
        {snap.heartbeats.length === 0 ? (
          <EmptyHint text="no heartbeats reported" />
        ) : (
          <ListShell>
            {snap.heartbeats.map((hb) => (
              <Row key={`${hb.agent}/${hb.session || '_'}`}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--radius-pill)',
                    background: dotColor(hb.status),
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span
                    className="t-code"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    {hb.agent}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      color: 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {hb.session || '—'} · age{' '}
                    {hb.ageSeconds == null ? '—' : `${hb.ageSeconds}s`} · timeout{' '}
                    {hb.timeoutSeconds}s
                  </span>
                </div>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusPill status={hb.status} />
                </span>
              </Row>
            ))}
          </ListShell>
        )}
      </section>

      <section style={{ marginBottom: 'var(--space-xl)' }}>
        <SectionHeader title="Processing timeouts" count={snap.timeouts.length} />
        {snap.timeouts.length === 0 ? (
          <EmptyHint text="no stale processing items" />
        ) : (
          <ListShell>
            {snap.timeouts.map((row) => (
              <Row key={`${row.agent}/${row.file}`}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="t-code" style={{ color: 'var(--color-ink)' }}>
                    {row.agent}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      color: 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {row.messageId || row.file}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      color: 'var(--color-timeline-done)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    age {row.ageSeconds}s · timeout {row.timeoutSeconds}s ·{' '}
                    {row.timestampSource}
                  </span>
                </div>
              </Row>
            ))}
          </ListShell>
        )}
      </section>

      <section>
        <SectionHeader
          title="Response contract breaches"
          count={snap.contracts.length}
        />
        {snap.contracts.length === 0 ? (
          <EmptyHint text="no contract breaches" />
        ) : (
          <ListShell>
            {snap.contracts.map((row) => (
              <Row key={`${row.agent}/${row.file}`}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span className="t-code" style={{ color: 'var(--color-ink)' }}>
                    {row.agent}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      color: 'var(--color-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {row.messageId || row.file} · {row.location}
                  </span>
                  <span
                    className="t-caption"
                    style={{
                      color: 'var(--color-error)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    expected {row.expectedSeconds}s · actual {row.actualSeconds}s
                  </span>
                </div>
              </Row>
            ))}
          </ListShell>
        )}
      </section>
    </>
  );
}
