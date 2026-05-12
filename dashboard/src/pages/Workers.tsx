import { useEffect, useState } from 'react';
import { api, type WorkerSession } from '../api/client';
import WorkerCard from '../components/WorkerCard';

export default function Workers() {
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
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Workers</div>
          <h1 className="title-xl">Runtime sessions</h1>
        </div>
        <span className={tmuxAvailable ? 'pill pill-processed' : 'pill pill-stale'}>tmux {tmuxAvailable ? 'available' : 'not detected'}</span>
      </header>

      {error && <div className="alert">{error}</div>}
      {loading ? (
        <div className="empty">Loading workers…</div>
      ) : workers.length === 0 ? (
        <div className="empty">No tmux sessions matching <code className="mono">awg-*</code>.</div>
      ) : (
        <div className="grid worker-grid">
          {workers.map((worker) => <WorkerCard key={worker.session} worker={worker} />)}
        </div>
      )}
    </div>
  );
}
