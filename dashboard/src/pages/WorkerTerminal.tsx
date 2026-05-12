import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import StatusPill from '../components/StatusPill';

type WSMessage =
  | { type: 'snapshot' | 'update'; session: string; data: string; ts: number }
  | { type: 'ping'; ts: number };

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getWorker(session)
      .then((data) => {
        if (cancelled) return;
        setWorker(data);
        if (data.recentOutput) setOutput(data.recentOutput);
      })
      .catch((err) => !cancelled && setError(String(err)));
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let ws: WebSocket | null = null;
    let retryMs = RECONNECT_INITIAL_MS;
    let retryTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(workerSocketUrl(session));
      ws.onopen = () => { setConnected(true); retryMs = RECONNECT_INITIAL_MS; };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WSMessage;
          if (msg.type === 'snapshot' || msg.type === 'update') setOutput(msg.data);
        } catch {
          /* ignore malformed stream frames */
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [session]);

  useEffect(() => {
    if (!preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  return (
    <div className="page">
      <button type="button" onClick={() => navigate('/workers')} className="action-btn">← Workers</button>
      <header className="page-header panel panel-pad">
        <div>
          <div className="eyebrow">Worker Terminal</div>
          <h1 className="title-lg mono">{session}</h1>
        </div>
        <StatusPill status={connected ? 'streaming' : 'disconnected'} tone={connected ? 'success' : 'neutral'} />
      </header>

      {worker && (
        <section className="panel panel-pad grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <Detail label="status" value={worker.status} />
          <Detail label="windows" value={String(worker.windows)} />
          <Detail label="attached" value={worker.attached ? 'yes' : 'no'} />
        </section>
      )}

      {error && <div role="alert" className="alert">{error}</div>}
      <pre ref={preRef} className="code-block terminal">{output || '(no output yet)'}</pre>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div className="mono body" style={{ color: 'var(--color-ink)', marginTop: 4 }}>{value}</div>
    </div>
  );
}
