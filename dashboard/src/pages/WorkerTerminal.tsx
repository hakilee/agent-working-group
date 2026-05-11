import { useEffect, useState } from 'react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useActivityParams, type ActivityComponentType } from '@stackflow/react';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import TerminalOutput from '../components/TerminalOutput';

type WSMessage =
  | { type: 'snapshot' | 'update'; session: string; data: string; ts: number }
  | { type: 'ping'; ts: number };

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 15000;

interface Params {
  session: string;
}

const WorkerTerminal: ActivityComponentType<Params> = () => {
  const { session = '' } = useActivityParams<Params>();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <AppScreen appBar={{ title: session || 'Worker', backButton: { ariaLabel: 'Back' } }}>
      <div className="app-screen app-screen--no-pad-bottom">
        <div className="stack-lg">
          <div className="row-between">
            <span className="font-mono" style={{ color: 'var(--app-fg)' }}>
              {session}
            </span>
            <div className="row" style={{ fontSize: 11 }}>
              <span
                className={`worker-dot ${connected ? 'worker-dot--on' : ''}`}
                style={connected ? undefined : { background: '#475569' }}
              />
              <span className="dim">{connected ? 'streaming' : 'disconnected'}</span>
            </div>
          </div>

          {worker && (
            <header className="card">
              <div className="dim" style={{ fontSize: 11 }}>
                status: {worker.status} · windows: {worker.windows} · attached:{' '}
                {worker.attached ? 'yes' : 'no'}
              </div>
            </header>
          )}

          {error && <div className="alert-error">{error}</div>}

          <TerminalOutput text={output} />
        </div>
      </div>
    </AppScreen>
  );
};

export default WorkerTerminal;
