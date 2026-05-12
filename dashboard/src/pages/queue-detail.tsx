import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusPill from '../components/status-pill';
import { formatNullable, formatRouteParticipant } from '../format';

type DetailRow = [label: string, value: string];

function loadQueueDetail(id: string): Promise<QueueDetail> {
  return api.getQueueItem(id);
}

function getDetailRows(item: QueueDetail): DetailRow[] {
  return [
    ['id', item.id],
    ['agent', item.agent],
    ['from', formatRouteParticipant(item.from)],
    ['to', formatRouteParticipant(item.to)],
    ['priority', String(item.priority)],
    ['filename', item.filename],
    ['created', formatNullable(item.createdAt)],
  ];
}

function hasRefs(item: QueueDetail): boolean {
  return Object.keys(item.refs ?? {}).length > 0;
}

export default function QueueDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<QueueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignoreResult = false;

    loadQueueDetail(id)
      .then((detail) => {
        if (ignoreResult) return;
        setItem(detail);
        setError(null);
      })
      .catch((e) => {
        if (!ignoreResult) setError(String(e));
      });

    return () => { ignoreResult = true; };
  }, [id]);

  return (
    <div className="page">
      <button type="button" onClick={() => navigate(-1)} className="action-btn"><IconArrowLeft size={15} stroke={1.8} />Back</button>
      {error && <div role="alert" className="alert">{error}</div>}
      {!error && !item && <div className="empty">Loading message…</div>}
      {item && <>
        <header className="page-header panel panel-pad"><div><div className="eyebrow">Queue Detail</div><h1 className="title-lg">{item.kind}</h1></div><StatusPill status={item.state} /></header>
        <section className="panel panel-pad">{getDetailRows(item).map(([label, value]) => <KV key={label} label={label} value={value} />)}</section>
        <Block title="Body">{item.body || '(empty)'}</Block>
        {hasRefs(item) && <Block title="Refs">{JSON.stringify(item.refs, null, 2)}</Block>}
        <Block title="Raw message">{JSON.stringify(item.message, null, 2)}</Block>
      </>}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 border-b border-ops-line py-2 last:border-b-0 dark:border-white/15 md:grid-cols-[120px_1fr]"><div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div><div className="break-words text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div></div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="grid gap-2"><h2 className="title-md">{title}</h2><pre className="code-block">{children}</pre></section>;
}
