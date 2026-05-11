import { use, Suspense, startTransition, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SystemStatus } from '../api/client';
import ActivityFeed from '../components/ActivityFeed';

const STATE_CARDS: Array<{ key: string; label: string; tone: string }> = [
  { key: 'pending', label: 'Pending', tone: 'text-amber-300' },
  { key: 'processing', label: 'Processing', tone: 'text-sky-300' },
  { key: 'processed', label: 'Processed', tone: 'text-emerald-300' },
  { key: 'dead', label: 'Dead', tone: 'text-rose-300' },
];

function StatusInner({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold text-slate-100">Overview</h1>
          <span className="font-mono text-xs text-slate-500">{status.root}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATE_CARDS.map((card) => (
            <div key={card.key} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className={`mt-1 text-3xl font-semibold ${card.tone}`}>
                {status.counts[card.key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Workers</div>
          <div className="mt-1 text-3xl font-semibold text-slate-100">{status.workers.total}</div>
          <div className="mt-2 text-xs text-slate-400">
            {status.workers.attached} attached · tmux {status.workers.tmuxAvailable ? 'ok' : 'unavailable'}
          </div>
          <Link
            to="/workers"
            className="mt-3 inline-flex text-xs text-emerald-400 hover:text-emerald-300"
          >
            view all workers →
          </Link>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Agents</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {status.agents.length ? (
              status.agents.map((agent) => (
                <span
                  key={agent}
                  className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-200"
                >
                  {agent}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">no agents registered</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Total queue items</div>
          <div className="mt-1 text-3xl font-semibold text-slate-100">{status.totalQueueItems}</div>
          <Link
            to="/queue"
            className="mt-3 inline-flex text-xs text-emerald-400 hover:text-emerald-300"
          >
            browse queue →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Recent activity</h2>
        <ActivityFeed entries={status.recentActivity} />
      </section>
    </div>
  );
}

export default function Dashboard() {
  const [promise, setPromise] = useState(() => api.status());

  useEffect(() => {
    // startTransition keeps the prior render mounted while the new promise
    // resolves, so the 5s poll no longer flashes the Suspense fallback.
    const id = window.setInterval(() => {
      startTransition(() => setPromise(api.status()));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Suspense
      fallback={<div className="text-sm text-slate-400">loading overview…</div>}
    >
      <StatusInner statusPromise={promise} />
    </Suspense>
  );
}
