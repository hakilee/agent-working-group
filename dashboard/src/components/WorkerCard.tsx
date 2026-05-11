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
      style={{
        textAlign: 'left',
        width: '100%',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-hairline-strong)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-hairline)';
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-sm)',
        }}
      >
        <span
          className="t-title-md"
          style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-mono)' }}
        >
          {worker.session}
        </span>
        <StatusPill status={worker.attached ? 'fresh' : 'stale'} />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-lg)',
          flexWrap: 'wrap',
        }}
      >
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
      <div
        className="t-caption-uppercase"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
      <div
        className="t-body-sm"
        style={{
          color: 'var(--color-ink)',
          marginTop: 2,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
