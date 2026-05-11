import { Link } from 'react-router-dom';
import type { WorkerSession } from '../api/client';

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function WorkerCard({ worker }: { worker: WorkerSession }) {
  const dot = worker.attached ? 'bg-emerald-400' : 'bg-sky-400';
  return (
    <Link
      to={`/workers/${encodeURIComponent(worker.session)}`}
      className="block rounded-lg border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/70"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="font-mono text-sm">{worker.session}</span>
        </div>
        <span className="text-xs text-slate-500">{worker.status}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div>
          <div className="text-slate-500">uptime</div>
          <div className="text-slate-200">{formatUptime(worker.uptimeSeconds)}</div>
        </div>
        <div>
          <div className="text-slate-500">windows</div>
          <div className="text-slate-200">{worker.windows}</div>
        </div>
      </div>
    </Link>
  );
}
