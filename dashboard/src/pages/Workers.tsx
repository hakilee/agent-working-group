import { useEffect, useState } from 'react';
import { api, type WorkerSession } from '../api/client';
import StatusPill from '../components/StatusPill';
import WorkerCard from '../components/WorkerCard';
import { WORKER_POLL_INTERVAL_MS } from '../dashboardRules';

type WorkerSnapshot = { workers: WorkerSession[]; tmuxAvailable: boolean };

async function loadWorkers(): Promise<WorkerSnapshot> {
  const data = await api.listWorkers();
  return { workers: data.items, tmuxAvailable: data.tmuxAvailable };
}

export default function Workers() {
  const [workers, setWorkers] = useState<WorkerSession[]>([]);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignoreResult = false;

    const refresh = () => {
      loadWorkers()
        .then((snapshot) => {
          if (ignoreResult) return;
          setWorkers(snapshot.workers);
          setTmuxAvailable(snapshot.tmuxAvailable);
          setError(null);
        })
        .catch((e) => {
          if (!ignoreResult) setError(String(e));
        })
        .finally(() => {
          if (!ignoreResult) setLoading(false);
        });
    };

    refresh();
    const intervalId = window.setInterval(refresh, WORKER_POLL_INTERVAL_MS);
    return () => {
      ignoreResult = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="page">
      <header className="page-header"><div><div className="eyebrow">Workers</div><h1 className="title-xl">Runtime sessions</h1></div><StatusPill status={tmuxAvailable ? 'processed' : 'stale'}>tmux {tmuxAvailable ? 'available' : 'not detected'}</StatusPill></header>
      {error && <div className="alert">{error}</div>}
      {loading ? <div className="empty">Loading workers…</div> : workers.length ? <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{workers.map((worker) => <WorkerCard key={worker.session} worker={worker} />)}</div> : <div className="empty">No tmux sessions matching <code>awg-*</code>.</div>}
    </div>
  );
}
