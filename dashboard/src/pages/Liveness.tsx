import { useEffect, useState } from 'react';
import {
  api,
  type ContractBreach,
  type HeartbeatEntry,
  type HeartbeatList,
  type TimeoutItem,
} from '../api/client';
import StatusBadge from '../components/StatusBadge';
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
    // Fallback polling for environments without the websocket.
    const id = window.setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Apply websocket pushes on top of the polled baseline.
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
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Liveness</h1>
        <div className="text-xs text-slate-500">
          fresh {snap.heartbeatCounts.fresh ?? 0} · stale{' '}
          {snap.heartbeatCounts.stale ?? 0} · missing{' '}
          {snap.heartbeatCounts.missing ?? 0}
        </div>
      </div>

      {error && (
        <div className="rounded border border-rose-800 bg-rose-900/30 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Heartbeats</h2>
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">status</th>
                <th className="px-3 py-2 font-medium">agent</th>
                <th className="px-3 py-2 font-medium">session</th>
                <th className="px-3 py-2 font-medium">age</th>
                <th className="px-3 py-2 font-medium">timeout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {snap.heartbeats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    no heartbeats reported
                  </td>
                </tr>
              )}
              {snap.heartbeats.map((hb) => (
                <tr key={`${hb.agent}/${hb.session || '_'}`} className="hover:bg-slate-900/60">
                  <td className="px-3 py-2">
                    <StatusBadge status={hb.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-200">{hb.agent}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {hb.session || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {hb.ageSeconds == null ? '—' : `${hb.ageSeconds}s`}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {hb.timeoutSeconds}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">
          Processing timeouts ({snap.timeouts.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">agent</th>
                <th className="px-3 py-2 font-medium">message</th>
                <th className="px-3 py-2 font-medium">age</th>
                <th className="px-3 py-2 font-medium">timeout</th>
                <th className="px-3 py-2 font-medium">source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {snap.timeouts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    no stale processing items
                  </td>
                </tr>
              )}
              {snap.timeouts.map((row) => (
                <tr key={`${row.agent}/${row.file}`} className="hover:bg-slate-900/60">
                  <td className="px-3 py-2 font-mono text-xs text-slate-200">{row.agent}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {row.messageId || row.file}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-amber-300">{row.ageSeconds}s</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.timeoutSeconds}s</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.timestampSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">
          Response contract breaches ({snap.contracts.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">agent</th>
                <th className="px-3 py-2 font-medium">message</th>
                <th className="px-3 py-2 font-medium">location</th>
                <th className="px-3 py-2 font-medium">expected</th>
                <th className="px-3 py-2 font-medium">actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {snap.contracts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    no contract breaches
                  </td>
                </tr>
              )}
              {snap.contracts.map((row) => (
                <tr key={`${row.agent}/${row.file}`} className="hover:bg-slate-900/60">
                  <td className="px-3 py-2 font-mono text-xs text-slate-200">{row.agent}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {row.messageId || row.file}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.location}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{row.expectedSeconds}s</td>
                  <td className="px-3 py-2 font-mono text-xs text-rose-300">{row.actualSeconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
