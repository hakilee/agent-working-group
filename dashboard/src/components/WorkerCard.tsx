import { useNavigate } from 'react-router-dom';
import type { WorkerSession } from '../api/client';
import StatusPill from './StatusPill';

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
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/workers/${encodeURIComponent(worker.session)}`)}
      className="card-button"
    >
      <div className="row-meta" style={{ justifyContent: 'space-between' }}>
        <strong className="title-md mono">{worker.session}</strong>
        <StatusPill status={worker.attached ? 'fresh' : 'stale'} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 18 }}>
        <Stat label="uptime" value={formatUptime(worker.uptimeSeconds)} />
        <Stat label="windows" value={String(worker.windows)} />
        <Stat label="status" value={worker.status} />
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div className="mono body" style={{ color: 'var(--color-ink)', marginTop: 4 }}>{value}</div>
    </div>
  );
}
