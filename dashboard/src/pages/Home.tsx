import { use, Suspense, startTransition, useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import { api, type SystemStatus } from '../api/client';
import ActivityFeed from '../components/ActivityFeed';
import BottomTabs from '../components/BottomTabs';
import { useFlow } from '../stackflow';

const STATE_CARDS: Array<{ key: string; label: string; tone: string }> = [
  { key: 'pending', label: 'Pending', tone: 'tile-value--warn' },
  { key: 'processing', label: 'Processing', tone: 'tile-value--info' },
  { key: 'processed', label: 'Processed', tone: 'tile-value--ok' },
  { key: 'dead', label: 'Dead', tone: 'tile-value--danger' },
];

function StatusInner({ statusPromise }: { statusPromise: Promise<SystemStatus> }) {
  const status = use(statusPromise);
  const flow = useFlow();
  return (
    <div className="stack-lg">
      <section>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <h1 className="h1">Overview</h1>
          <span className="font-mono dim" style={{ fontSize: 11 }}>
            {status.root}
          </span>
        </div>
        <div className="tile-grid">
          {STATE_CARDS.map((card) => (
            <div key={card.key} className="tile">
              <div className="tile-label">{card.label}</div>
              <div className={`tile-value ${card.tone}`}>
                {status.counts[card.key] ?? 0}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="col">
        <div className="card">
          <div className="tile-label">Workers</div>
          <div className="tile-value">{status.workers.total}</div>
          <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
            {status.workers.attached} attached · tmux{' '}
            {status.workers.tmuxAvailable ? 'ok' : 'unavailable'}
          </div>
          <button
            type="button"
            className="link-inline"
            style={{ marginTop: 10 }}
            onClick={() => flow.replace('Workers', {}, { animate: false })}
          >
            view all workers →
          </button>
        </div>
        <div className="card">
          <div className="tile-label">Agents</div>
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {status.agents.length ? (
              status.agents.map((agent) => (
                <span key={agent} className="chip">
                  {agent}
                </span>
              ))
            ) : (
              <span className="dim" style={{ fontSize: 11 }}>
                no agents registered
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="tile-label">Total queue items</div>
          <div className="tile-value">{status.totalQueueItems}</div>
          <button
            type="button"
            className="link-inline"
            style={{ marginTop: 10 }}
            onClick={() => flow.replace('QueueList', {}, { animate: false })}
          >
            browse queue →
          </button>
        </div>
      </section>

      <section>
        <h2 className="section-title">Recent activity</h2>
        <ActivityFeed entries={status.recentActivity} />
      </section>
    </div>
  );
}

const Home: ActivityComponentType = () => {
  const [promise, setPromise] = useState(() => api.status());

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => setPromise(api.status()));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <AppScreen appBar={{ title: 'AWG' }}>
      <div className="app-screen">
        <Suspense fallback={<div className="muted">loading overview…</div>}>
          <StatusInner statusPromise={promise} />
        </Suspense>
      </div>
      <BottomTabs />
    </AppScreen>
  );
};

export default Home;
