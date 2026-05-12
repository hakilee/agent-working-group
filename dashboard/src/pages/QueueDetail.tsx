import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusPill from '../components/StatusPill';

function KVRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <div className="kpi-label">{label}</div>
      <div className={mono ? 'mono body' : 'body'} style={{ color: 'var(--color-ink)', minWidth: 0, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="code-block">{children}</pre>;
}

export default function QueueDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<QueueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getQueueItem(id)
      .then((data) => !cancelled && setItem(data))
      .catch((err) => !cancelled && setError(String(err)));
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="page">
      <button type="button" onClick={() => navigate(-1)} className="action-btn">← Back</button>

      {error && <div role="alert" className="alert">{error}</div>}
      {!error && !item && <div className="empty">Loading message…</div>}

      {item && (
        <>
          <header className="page-header panel panel-pad">
            <div>
              <div className="eyebrow">Queue Detail</div>
              <h1 className="title-lg">{item.kind}</h1>
            </div>
            <StatusPill status={item.state} />
          </header>

          <section className="panel panel-pad">
            <KVRow label="id" value={item.id} mono />
            <KVRow label="agent" value={item.agent} mono />
            <KVRow label="from" value={item.from ?? '?'} mono />
            <KVRow label="to" value={item.to ?? '?'} mono />
            <KVRow label="priority" value={String(item.priority)} />
            <KVRow label="filename" value={item.filename} mono />
            <KVRow label="created" value={item.createdAt ?? '—'} mono />
          </section>

          <Section title="Body"><CodeBlock>{item.body || '(empty)'}</CodeBlock></Section>
          {Object.keys(item.refs ?? {}).length > 0 && <Section title="Refs"><CodeBlock>{JSON.stringify(item.refs, null, 2)}</CodeBlock></Section>}
          <Section title="Raw message"><CodeBlock>{JSON.stringify(item.message, null, 2)}</CodeBlock></Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid">
      <h2 className="title-md">{title}</h2>
      {children}
    </section>
  );
}
