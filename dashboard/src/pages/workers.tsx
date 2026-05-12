import { useEffect, useState, type ReactNode } from 'react';
import { api, type WorkerSession } from '../api/client';
import StatusPill from '../components/status-pill';
import { Page, PageHeader } from '../components/ui/page';
import WorkerCard from '../components/worker-card';
import { WORKER_POLL_INTERVAL_MS } from '../dashboard-rules';

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
    <Page>
      <PageHeader eyebrow="Workers" title="Runtime sessions">
        <StatusPill status={tmuxAvailable ? 'processed' : 'stale'}>tmux {tmuxAvailable ? 'available' : 'not detected'}</StatusPill>
      </PageHeader>
      {error && <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {loading ? (
        <Empty>Loading workers...</Empty>
      ) : workers.length ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {workers.map((worker) => <WorkerCard key={worker.session} worker={worker} />)}
        </div>
      ) : (
        <Empty>No tmux sessions matching <code>awg-*</code>.</Empty>
      )}
    </Page>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">{children}</div>;
}
