import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusPill from '../components/StatusPill';

export default function QueueDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<QueueDetail | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { let off = false; api.getQueueItem(id).then((d) => !off && setItem(d)).catch((e) => !off && setError(String(e))); return () => { off = true; }; }, [id]);
  return (
    <div className="page">
      <button type="button" onClick={() => navigate(-1)} className="action-btn">← Back</button>
      {error && <div role="alert" className="alert">{error}</div>}
      {!error && !item && <div className="empty">Loading message…</div>}
      {item && <>
        <header className="page-header panel panel-pad"><div><div className="eyebrow">Queue Detail</div><h1 className="title-lg">{item.kind}</h1></div><StatusPill status={item.state} /></header>
        <section className="panel panel-pad">{[
          ['id', item.id], ['agent', item.agent], ['from', item.from ?? '?'], ['to', item.to ?? '?'], ['priority', item.priority], ['filename', item.filename], ['created', item.createdAt ?? '—'],
        ].map(([k, v]) => <KV key={k} label={String(k)} value={String(v)} />)}</section>
        <Block title="Body">{item.body || '(empty)'}</Block>
        {!!Object.keys(item.refs ?? {}).length && <Block title="Refs">{JSON.stringify(item.refs, null, 2)}</Block>}
        <Block title="Raw message">{JSON.stringify(item.message, null, 2)}</Block>
      </>}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-ops-line py-3 last:border-b-0 dark:border-white/15 md:grid-cols-[140px_1fr]"><div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div><div className="break-words text-sm text-ops-ink dark:text-[#eef3ec]">{value}</div></div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-3"><h2 className="title-md">{title}</h2><pre className="code-block">{children}</pre></section>;
}
