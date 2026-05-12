import { IconArrowLeft, IconPower, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import StatusPill from '../components/status-pill';
import { Button } from '../components/ui/button';
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

function parseWindowIndex(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const windowIndex = useMemo(() => parseWindowIndex(searchParams.get('window')), [searchParams]);
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let ignoreResult = false;

    api.getWorker(session, undefined, windowIndex)
      .then((data) => {
        if (ignoreResult) return;
        setWorker(data);
        setError(null);
        setOutput(data.recentOutput ?? '');
      })
      .catch((e) => {
        if (!ignoreResult) setError(String(e));
      });

    return () => { ignoreResult = true; };
  }, [session, windowIndex]);

  useEffect(() => {
    if (!session) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let retryDelayMs = WORKER_SOCKET_INITIAL_RETRY_MS;
    let closedByEffect = false;

    const connect = () => {
      if (closedByEffect) return;
      ws = new WebSocket(workerSocketUrl(session, windowIndex));
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
  }, [session, windowIndex]);

  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  const requestAction = async (action: 'close-session' | 'close-window') => {
    setActionPending(true);
    setActionMessage(null);
    try {
      const response = await api.requestWorkerAction(session, action, {
        window: action === 'close-window' ? windowIndex : undefined,
        reason: 'Requested from AWG dashboard Workers page',
      });
      setActionMessage(`Queued ${action}: ${response.messageId}`);
    } catch (e) {
      setActionMessage(String(e));
    } finally {
      setActionPending(false);
    }
  };

  return (
    <Page>
      <Button type="button" onClick={() => navigate('/workers')} size="small" className="w-fit">
        <IconArrowLeft size={15} stroke={1.8} />Workers
      </Button>
      <header className="flex flex-wrap items-end justify-between gap-3 border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Worker Terminal</div>
          <h1 className="break-all text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">{session}{windowIndex !== undefined ? `:${windowIndex}` : ''}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={connected ? 'streaming' : 'disconnected'} size="small" />
          <Button type="button" disabled={actionPending} onClick={() => requestAction('close-session')} size="small" variant="danger">
            <IconPower size={14} stroke={1.8} />Queue close session
          </Button>
          {windowIndex !== undefined && (
            <Button type="button" disabled={actionPending} onClick={() => requestAction('close-window')} size="small" variant="warning">
              <IconX size={14} stroke={1.8} />Queue close window
            </Button>
          )}
        </div>
      </header>
      {worker && (
        <section className="grid gap-3 border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([['status', worker.status], ['windows', worker.windows], ['attached', worker.attached ? 'yes' : 'no']] as const).map(([label, value]) => <WorkerStat key={label} label={String(label)} value={String(value)} />)}
          </div>
          {worker.windowItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-ops-line pt-3 dark:border-white/10">
              <button type="button" onClick={() => setSearchParams({})} className={`border px-2.5 py-1.5 text-xs font-bold transition ${windowIndex === undefined ? 'border-ops-green bg-emerald-50 text-ops-green dark:bg-emerald-400/15 dark:text-emerald-200' : 'border-ops-line bg-white/50 text-ops-ink hover:bg-white/85 dark:border-white/15 dark:bg-white/5 dark:text-[#eef3ec]'}`}>session</button>
              {worker.windowItems.map((window) => (
                <button key={window.index} type="button" onClick={() => setSearchParams({ window: String(window.index) })} className={`border px-2.5 py-1.5 text-xs font-bold transition ${windowIndex === window.index ? 'border-ops-green bg-emerald-50 text-ops-green dark:bg-emerald-400/15 dark:text-emerald-200' : 'border-ops-line bg-white/50 text-ops-ink hover:bg-white/85 dark:border-white/15 dark:bg-white/5 dark:text-[#eef3ec]'}`}>#{window.index} {window.name || '(unnamed)'}</button>
              ))}
            </div>
          )}
        </section>
      )}
      {actionMessage && <div className="border border-ops-line bg-emerald-50/80 p-3 text-xs text-ops-green dark:border-white/15 dark:bg-emerald-950/30 dark:text-emerald-200">{actionMessage}</div>}
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
