import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import StatusPill from '../components/status-pill';
import { Page } from '../components/ui/page';
import { WORKER_SOCKET_INITIAL_RETRY_MS, WORKER_SOCKET_MAX_RETRY_MS } from '../dashboard-rules';

type WorkerSocketMessage = { type: 'snapshot' | 'update'; data: string } | { type: 'ping'; ts: number };

function isTerminalOutputMessage(message: WorkerSocketMessage): message is Extract<WorkerSocketMessage, { type: 'snapshot' | 'update' }> {
  return message.type === 'snapshot' || message.type === 'update';
}

function parseWorkerSocketMessage(data: string): WorkerSocketMessage | null {
  try {
    return JSON.parse(data) as WorkerSocketMessage;
  } catch {
    return null;
  }
}

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let ignoreResult = false;

    api.getWorker(session)
      .then((data) => {
        if (ignoreResult) return;
        setWorker(data);
        if (data.recentOutput) setOutput(data.recentOutput);
      })
      .catch((e) => {
        if (!ignoreResult) setError(String(e));
      });

    return () => { ignoreResult = true; };
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let retryDelayMs = WORKER_SOCKET_INITIAL_RETRY_MS;
    let closedByEffect = false;

    const connect = () => {
      if (closedByEffect) return;
      ws = new WebSocket(workerSocketUrl(session));
      ws.onopen = () => {
        setConnected(true);
        retryDelayMs = WORKER_SOCKET_INITIAL_RETRY_MS;
      };
      ws.onclose = () => {
        setConnected(false);
        if (closedByEffect) return;
        reconnectTimer = window.setTimeout(connect, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, WORKER_SOCKET_MAX_RETRY_MS);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (event) => {
        const message = parseWorkerSocketMessage(event.data);
        if (message && isTerminalOutputMessage(message)) setOutput(message.data);
      };
    };

    connect();
    return () => {
      closedByEffect = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [session]);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  return (
    <Page>
      <button type="button" onClick={() => navigate('/workers')} className="inline-flex w-fit items-center gap-1.5 border border-transparent bg-[#ebe6da] px-2.5 py-1.5 text-xs font-bold text-ops-ink transition hover:border-ops-line hover:bg-emerald-50 dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15">
        <IconArrowLeft size={15} stroke={1.8} />Workers
      </button>
      <header className="flex flex-wrap items-end justify-between gap-3 border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Worker Terminal</div>
          <h1 className="break-all text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">{session}</h1>
        </div>
        <StatusPill status={connected ? 'streaming' : 'disconnected'} />
      </header>
      {worker && (
        <section className="grid gap-2 border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 sm:grid-cols-3 md:p-4">
          {([['status', worker.status], ['windows', worker.windows], ['attached', worker.attached ? 'yes' : 'no']] as const).map(([label, value]) => <WorkerStat key={label} label={String(label)} value={String(value)} />)}
        </section>
      )}
      {error && <div role="alert" className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      <pre ref={preRef} className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words border border-ops-line bg-[#0e1512] p-3 font-mono text-[11px] leading-5 text-[#dcebe0] dark:border-white/15">{output || '(no output yet)'}</pre>
    </Page>
  );
}

function WorkerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-muted dark:text-[#839087]">{label}</div>
      <div className="mt-1 text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div>
    </div>
  );
}
