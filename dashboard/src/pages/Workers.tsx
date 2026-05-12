import { useEffect, useState } from 'react';
import { api, type WorkerSession } from '../api/client';
import StatusPill from '../components/StatusPill';
import WorkerCard from '../components/WorkerCard';

export default function Workers() {
  const [workers, setWorkers] = useState<WorkerSession[]>([]), [tmuxAvailable, setTmuxAvailable] = useState(true), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  useEffect(() => { let off = false; const load = () => api.listWorkers().then((d) => !off && (setWorkers(d.items), setTmuxAvailable(d.tmuxAvailable), setError(null))).catch((e) => !off && setError(String(e))).finally(() => !off && setLoading(false)); load(); const id = window.setInterval(load, 4000); return () => { off = true; window.clearInterval(id); }; }, []);
  return (
    <div className="page">
      <header className="page-header"><div><div className="eyebrow">Workers</div><h1 className="title-xl">Runtime sessions</h1></div><StatusPill status={tmuxAvailable ? 'processed' : 'stale'}>tmux {tmuxAvailable ? 'available' : 'not detected'}</StatusPill></header>
      {error && <div className="alert">{error}</div>}
      {loading ? <div className="empty">Loading workers…</div> : workers.length ? <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{workers.map((w) => <WorkerCard key={w.session} worker={w} />)}</div> : <div className="empty">No tmux sessions matching <code>awg-*</code>.</div>}
    </div>
  );
}
