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
  const [output, setOutput] = useState<string>('');
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
    return () => {
      cancelled = true;
    };
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
      ws.onopen = () => {
        setConnected(true);
        retryMs = RECONNECT_INITIAL_MS;
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, RECONNECT_MAX_MS);
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WSMessage;
          if (msg.type === 'snapshot' || msg.type === 'update') setOutput(msg.data);
        } catch {
          /* ignore */
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
    <>
      <button
        type="button"
        onClick={() => navigate('/workers')}
        className="t-button"
        style={{
          color: 'var(--color-ink)',
          marginBottom: 'var(--space-base)',
        }}
      >
        ← Workers
      </button>

      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-base)',
          marginBottom: 'var(--space-lg)',
          flexWrap: 'wrap',
        }}
      >
        <h1
          className="t-display-md"
          style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-mono)' }}
        >
          {session}
        </h1>
        <StatusPill
          status={connected ? 'streaming' : 'disconnected'}
          tone={connected ? 'success' : 'neutral'}
        />
      </header>

      {worker && (
        <section
          style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-base) var(--space-lg)',
            marginBottom: 'var(--space-base)',
            display: 'flex',
            gap: 'var(--space-lg)',
            flexWrap: 'wrap',
          }}
        >
          <Detail label="status" value={worker.status} />
          <Detail label="windows" value={String(worker.windows)} />
          <Detail label="attached" value={worker.attached ? 'yes' : 'no'} />
        </section>
      )}

      {error && (
        <div
          role="alert"
          className="t-body-sm"
          style={{
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-error)',
            color: 'var(--color-error)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-base) var(--space-lg)',
            marginBottom: 'var(--space-base)',
          }}
        >
          {error}
        </div>
      )}

      <pre
        ref={preRef}
        className="t-code"
        style={{
          background: 'var(--color-canvas-soft)',
          border: '1px solid var(--color-hairline)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-md)',
          color: 'var(--color-ink)',
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 600,
          overflowY: 'auto',
        }}
      >
        {output || '(no output yet)'}
      </pre>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
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
