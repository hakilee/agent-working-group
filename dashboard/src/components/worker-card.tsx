import { useNavigate } from 'react-router-dom';
import type { WorkerSession } from '../api/client';
import { formatUptime } from '../format';
import StatusPill from './status-pill';

function workerStats(worker: WorkerSession): Array<[string, string]> {
  return [
    ['uptime', formatUptime(worker.uptimeSeconds)],
    ['windows', String(worker.windows)],
    ['status', worker.status],
  ];
}

export default function WorkerCard({ worker }: { worker: WorkerSession }) {
  const navigate = useNavigate();
  const stats = workerStats(worker);

  return (
    <button
      type="button"
      onClick={() => navigate(`/workers/${encodeURIComponent(worker.session)}`)}
      className="w-full border border-ops-line bg-ops-panel p-3 text-left text-inherit transition hover:border-black/25 hover:bg-white/95 dark:border-white/15 dark:bg-[#1e2722]/85 dark:hover:border-white/30 dark:hover:bg-[#243029]"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <strong className="break-all text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]">{worker.session}</strong>
        <StatusPill status={worker.status}>{worker.attached ? 'attached' : 'running'}</StatusPill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-muted dark:text-[#839087]">{label}</div>
      <div className="mt-1 break-words text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div>
    </div>
  );
}
