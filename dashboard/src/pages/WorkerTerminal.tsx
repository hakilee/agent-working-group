import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import TerminalOutput from '../components/TerminalOutput';

type WSMessage =
  | { type: 'snapshot' | 'update'; session: string; data: string; ts: number }
  | { type: 'ping'; ts: number };

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const [worker, setWorker] = useState<WorkerSession | null>(null);
  const [output, setOutput] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
    const ws = new WebSocket(workerSocketUrl(session));
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        if (msg.type === 'snapshot' || msg.type === 'update') setOutput(msg.data);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
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
