import type { WorkerSession } from '../api/client';
import { useFlow } from '../stackflow';

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
  const flow = useFlow();
  return (
    <button
      type="button"
      className="worker-card"
      onClick={() => flow.push('WorkerTerminal', { session: worker.session })}
    >
      <div className="row-between">
        <div className="row">
          <span
            className={`worker-dot ${worker.attached ? 'worker-dot--on' : 'worker-dot--off'}`}
          />
          <span className="font-mono">{worker.session}</span>
        </div>
        <span className="dim" style={{ fontSize: 11 }}>
          {worker.status}
        </span>
      </div>
      <div className="kv-grid" style={{ marginTop: 12 }}>
        <div>
          <div className="dim">uptime</div>
          <div style={{ color: 'var(--app-fg)' }}>{formatUptime(worker.uptimeSeconds)}</div>
        </div>
        <div>
          <div className="dim">windows</div>
          <div style={{ color: 'var(--app-fg)' }}>{worker.windows}</div>
        </div>
      </div>
    </button>
  );
}
