import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, workerSocketUrl, type WorkerSession } from '../api/client';
import StatusPill from '../components/StatusPill';

type WSMessage = { type: 'snapshot' | 'update'; data: string } | { type: 'ping'; ts: number };

export default function WorkerTerminal() {
  const { session = '' } = useParams<{ session: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerSession | null>(null), [output, setOutput] = useState(''), [connected, setConnected] = useState(false), [error, setError] = useState<string | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => { let off = false; api.getWorker(session).then((d) => !off && (setWorker(d), d.recentOutput && setOutput(d.recentOutput))).catch((e) => !off && setError(String(e))); return () => { off = true; }; }, [session]);
  useEffect(() => {
    if (!session) return;
    let ws: WebSocket | null = null, timer: number | undefined, retry = 1000, off = false;
    const connect = () => { if (off) return; ws = new WebSocket(workerSocketUrl(session)); ws.onopen = () => (setConnected(true), retry = 1000); ws.onclose = () => { setConnected(false); if (!off) timer = window.setTimeout(connect, retry), retry = Math.min(retry * 2, 15000); }; ws.onerror = () => ws?.close(); ws.onmessage = (ev) => { try { const msg = JSON.parse(ev.data) as WSMessage; if (msg.type === 'snapshot' || msg.type === 'update') setOutput(msg.data); } catch { /* ignore malformed frames */ } }; };
    connect(); return () => { off = true; if (timer) window.clearTimeout(timer); ws?.close(); };
  }, [session]);
  useEffect(() => { if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight; }, [output]);
  return (
    <div className="page">
      <button type="button" onClick={() => navigate('/workers')} className="action-btn">← Workers</button>
      <header className="page-header panel panel-pad"><div><div className="eyebrow">Worker Terminal</div><h1 className="title-lg break-all">{session}</h1></div><StatusPill status={connected ? 'streaming' : 'disconnected'} /></header>
      {worker && <section className="panel panel-pad grid gap-4 sm:grid-cols-3">{[['status', worker.status], ['windows', worker.windows], ['attached', worker.attached ? 'yes' : 'no']].map(([k, v]) => <div key={k}><div className="eyebrow text-ops-muted dark:text-[#839087]">{k}</div><div className="mt-1 text-sm text-ops-ink dark:text-[#eef3ec]">{String(v)}</div></div>)}</section>}
      {error && <div role="alert" className="alert">{error}</div>}
      <pre ref={preRef} className="code-block max-h-[620px] bg-[#0e1512] text-[#dcebe0]">{output || '(no output yet)'}</pre>
    </div>
  );
}
