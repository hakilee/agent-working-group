import { useNavigate } from 'react-router-dom';
import type { WorkerSession } from '../api/client';
import StatusPill from './StatusPill';

const uptime = (s: number | null) => s == null ? '—' : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

export default function WorkerCard({ worker }: { worker: WorkerSession }) {
  const navigate = useNavigate();
  const stats = [['uptime', uptime(worker.uptimeSeconds)], ['windows', String(worker.windows)], ['status', worker.status]] as const;
  return (
    <button type="button" onClick={() => navigate(`/workers/${encodeURIComponent(worker.session)}`)} className="card-button">
      <div className="row-meta justify-between">
        <strong className="title-md break-all">{worker.session}</strong>
        <StatusPill status={worker.attached ? 'fresh' : 'stale'} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => <Stat key={label} label={label} value={String(value)} />)}
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div><div className="mt-1 break-words text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div></div>;
}
