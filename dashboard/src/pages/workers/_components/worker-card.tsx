import { IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router';
import type { WorkerSession, WorkerWindow } from '../../../api/client';
import { formatUptime } from '../../../format';
import StatusPill from '../../../components/status-pill';

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
  const openSession = () => navigate(`/workers/${encodeURIComponent(worker.session)}`);
  const openWindow = (window: WorkerWindow) => navigate(`/workers/${encodeURIComponent(worker.session)}?window=${window.index}`);

  return (
    <article className="border border-ops-line bg-ops-panel p-3 text-left text-inherit shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
      <button type="button" onClick={openSession} className="w-full text-left text-inherit">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <strong className="break-all text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]">{worker.session}</strong>
          <StatusPill status={worker.status}>{worker.attached ? 'attached' : 'running'}</StatusPill>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {stats.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
        </div>
      </button>

      {worker.windowItems.length > 0 && (
        <div className="mt-3 grid gap-1.5 border-t border-ops-line pt-3 dark:border-white/10">
          {worker.windowItems.map((window) => (
            <button
              key={window.index}
              type="button"
              onClick={() => openWindow(window)}
              className="flex items-center justify-between gap-2 border border-transparent bg-white/40 px-2.5 py-2 text-left text-xs transition hover:border-black/20 hover:bg-white/80 dark:bg-white/5 dark:hover:border-white/15 dark:hover:bg-white/10"
            >
              <span className="min-w-0">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ops-green dark:text-emerald-300">window {window.index}</span>
                <span className="mt-0.5 block truncate font-bold text-ops-ink dark:text-[#eef3ec]">{window.name || '(unnamed)'}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-ops-muted dark:text-[#839087]">
                {window.active ? 'active' : `${window.panes} pane${window.panes === 1 ? '' : 's'}`}
                <IconChevronRight size={14} stroke={1.8} />
              </span>
            </button>
          ))}
        </div>
      )}
    </article>
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
