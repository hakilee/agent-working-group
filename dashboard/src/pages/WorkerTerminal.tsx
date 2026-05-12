import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import StatusPill from '../components/StatusPill';
import { WORKER_SOCKET_INITIAL_RETRY_MS, WORKER_SOCKET_MAX_RETRY_MS } from '../dashboardRules';

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
    <div className="page">
      <button type="button" onClick={() => navigate('/workers')} className="action-btn">← Workers</button>
      <header className="page-header panel panel-pad"><div><div className="eyebrow">Worker Terminal</div><h1 className="title-lg break-all">{session}</h1></div><StatusPill status={connected ? 'streaming' : 'disconnected'} /></header>
      {worker && <section className="panel panel-pad grid gap-2 sm:grid-cols-3">{[['status', worker.status], ['windows', worker.windows], ['attached', worker.attached ? 'yes' : 'no']].map(([label, value]) => <WorkerStat key={label} label={String(label)} value={String(value)} />)}</section>}
      {error && <div role="alert" className="alert">{error}</div>}
      <pre ref={preRef} className="code-block max-h-[620px] bg-[#0e1512] text-[#dcebe0]">{output || '(no output yet)'}</pre>
    </div>
  );
}

function WorkerStat({ label, value }: { label: string; value: string }) {
  return <div><div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div><div className="mt-1 text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div></div>;
}
