import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import {
  api,
  type ContractBreach,
  type HeartbeatEntry,
  type HeartbeatList,
  type TimeoutItem,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
import BottomTabs from '../components/BottomTabs';
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

const Liveness: ActivityComponentType = () => {
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
    <AppScreen appBar={{ title: 'Liveness' }}>
      <div className="app-screen">
        <div className="stack-lg">
          <div className="row-between">
            <h1 className="h1">Liveness</h1>
            <div className="dim" style={{ fontSize: 11 }}>
              fresh {snap.heartbeatCounts.fresh ?? 0} · stale{' '}
              {snap.heartbeatCounts.stale ?? 0} · missing{' '}
              {snap.heartbeatCounts.missing ?? 0}
            </div>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <section>
            <h2 className="section-title">Heartbeats</h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>status</th>
                    <th>agent</th>
                    <th>session</th>
                    <th>age</th>
                    <th>timeout</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.heartbeats.length === 0 && (
                    <tr className="empty-row">
                      <td colSpan={5}>no heartbeats reported</td>
                    </tr>
                  )}
                  {snap.heartbeats.map((hb) => (
                    <tr key={`${hb.agent}/${hb.session || '_'}`}>
                      <td>
                        <StatusBadge status={hb.status} />
                      </td>
                      <td className="font-mono" style={{ color: 'var(--app-fg)', fontSize: 11 }}>
                        {hb.agent}
                      </td>
                      <td className="font-mono muted" style={{ fontSize: 11 }}>
                        {hb.session || '—'}
                      </td>
                      <td className="font-mono muted" style={{ fontSize: 11 }}>
                        {hb.ageSeconds == null ? '—' : `${hb.ageSeconds}s`}
                      </td>
                      <td className="font-mono dim" style={{ fontSize: 11 }}>
                        {hb.timeoutSeconds}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="section-title">
              Processing timeouts ({snap.timeouts.length})
            </h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>agent</th>
                    <th>message</th>
                    <th>age</th>
                    <th>timeout</th>
                    <th>source</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.timeouts.length === 0 && (
                    <tr className="empty-row">
                      <td colSpan={5}>no stale processing items</td>
                    </tr>
                  )}
                  {snap.timeouts.map((row) => (
                    <tr key={`${row.agent}/${row.file}`}>
                      <td className="font-mono" style={{ color: 'var(--app-fg)', fontSize: 11 }}>
                        {row.agent}
                      </td>
                      <td className="font-mono muted" style={{ fontSize: 11 }}>
                        {row.messageId || row.file}
                      </td>
                      <td className="font-mono" style={{ color: 'var(--app-warn)', fontSize: 11 }}>
                        {row.ageSeconds}s
                      </td>
                      <td className="font-mono dim" style={{ fontSize: 11 }}>
                        {row.timeoutSeconds}s
                      </td>
                      <td className="font-mono dim" style={{ fontSize: 11 }}>
                        {row.timestampSource}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="section-title">
              Response contract breaches ({snap.contracts.length})
            </h2>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>agent</th>
                    <th>message</th>
                    <th>location</th>
                    <th>expected</th>
                    <th>actual</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.contracts.length === 0 && (
                    <tr className="empty-row">
                      <td colSpan={5}>no contract breaches</td>
                    </tr>
                  )}
                  {snap.contracts.map((row) => (
                    <tr key={`${row.agent}/${row.file}`}>
                      <td className="font-mono" style={{ color: 'var(--app-fg)', fontSize: 11 }}>
                        {row.agent}
                      </td>
                      <td className="font-mono muted" style={{ fontSize: 11 }}>
                        {row.messageId || row.file}
                      </td>
                      <td className="font-mono dim" style={{ fontSize: 11 }}>
                        {row.location}
                      </td>
                      <td className="font-mono dim" style={{ fontSize: 11 }}>
                        {row.expectedSeconds}s
                      </td>
                      <td className="font-mono" style={{ color: 'var(--app-danger)', fontSize: 11 }}>
                        {row.actualSeconds}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
      <BottomTabs />
    </AppScreen>
  );
};

export default Liveness;
