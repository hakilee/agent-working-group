import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import TerminalOutput from '../components/TerminalOutput';

type WSMessage =
  | { type: 'snapshot' | 'update'; session: string; data: string; ts: number }
  | { type: 'ping'; ts: number };

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
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
        // onerror is always followed by onclose, so let the close handler
        // schedule the reconnect.
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/workers" className="text-xs text-slate-400 hover:text-slate-200">
          ← back to workers
        </Link>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className="text-slate-500">{connected ? 'streaming' : 'disconnected'}</span>
        </div>
      </div>

      <header className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="font-mono text-sm text-slate-100">{session}</div>
        {worker && (
          <div className="mt-1 text-xs text-slate-500">
            status: {worker.status} · windows: {worker.windows} ·{' '}
            attached: {worker.attached ? 'yes' : 'no'}
          </div>
        )}
      </header>

      {error && (
        <div className="rounded border border-rose-800 bg-rose-900/30 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <TerminalOutput text={output} />
    </div>
  );
}
