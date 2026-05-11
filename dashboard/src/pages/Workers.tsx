import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import type { ActivityComponentType } from '@stackflow/react';
import { api, type WorkerSession } from '../api/client';
import WorkerCard from '../components/WorkerCard';
import BottomTabs from '../components/BottomTabs';

const Workers: ActivityComponentType = () => {
  const [workers, setWorkers] = useState<WorkerSession[]>([]);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchWorkers = () => {
      api
        .listWorkers()
        .then((data) => {
          if (cancelled) return;
          setWorkers(data.items);
          setTmuxAvailable(data.tmuxAvailable);
          setError(null);
        })
        .catch((err) => !cancelled && setError(String(err)))
        .finally(() => !cancelled && setLoading(false));
    };
    fetchWorkers();
    const id = window.setInterval(fetchWorkers, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <AppScreen appBar={{ title: 'Workers' }}>
      <div className="app-screen">
        <div className="stack-lg">
          <div className="row-between">
            <h1 className="h1">Workers</h1>
            <span className="dim" style={{ fontSize: 11 }}>
              tmux: {tmuxAvailable ? 'available' : 'not detected'}
            </span>
          </div>

          {error && <div className="alert-error">{error}</div>}

          {loading ? (
            <div className="muted">loading…</div>
          ) : workers.length === 0 ? (
            <div className="card-dashed">
              No tmux sessions matching <code className="font-mono">awg-*</code>.
            </div>
          ) : (
            <div className="worker-grid">
              {workers.map((worker) => (
                <WorkerCard key={worker.session} worker={worker} />
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomTabs />
    </AppScreen>
  );
};

export default Workers;
