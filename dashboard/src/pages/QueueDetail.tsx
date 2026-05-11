import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusPill from '../components/StatusPill';

function KVRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-base)',
        padding: 'var(--space-sm) 0',
        borderBottom: '1px solid var(--color-hairline-soft)',
      }}
    >
      <div
        className="t-body-sm"
        style={{
          color: 'var(--color-muted)',
          width: 120,
          flexShrink: 0,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? 't-code' : 't-body-md'}
        style={{ color: 'var(--color-ink)', minWidth: 0, wordBreak: 'break-word' }}
      >
        {value}
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="t-code"
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-md)',
        color: 'var(--color-ink)',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflow: 'auto',
      }}
    >
      {children}
    </pre>
  );
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
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="t-button"
        style={{
          color: 'var(--color-ink)',
          marginBottom: 'var(--space-base)',
        }}
      >
        ← Back
      </button>

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
          }}
        >
          {error}
        </div>
      )}

      {!error && !item && (
        <p className="t-body-md" style={{ color: 'var(--color-muted)' }}>
          loading…
        </p>
      )}

      {item && (
        <>
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
            <h1 className="t-display-md" style={{ color: 'var(--color-ink)' }}>
              {item.kind}
            </h1>
            <StatusPill status={item.state} />
          </header>

          <section
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-hairline)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-lg)',
              marginBottom: 'var(--space-lg)',
            }}
          >
            <KVRow label="id" value={item.id} mono />
            <KVRow label="agent" value={item.agent} mono />
            <KVRow label="from" value={item.from ?? '?'} mono />
            <KVRow label="to" value={item.to ?? '?'} mono />
            <KVRow label="priority" value={String(item.priority)} />
            <KVRow label="filename" value={item.filename} mono />
            <KVRow label="created" value={item.createdAt ?? '—'} mono />
          </section>

          <section style={{ marginBottom: 'var(--space-lg)' }}>
            <h2
              className="t-title-md"
              style={{
                color: 'var(--color-ink)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Body
            </h2>
            <CodeBlock>{item.body || '(empty)'}</CodeBlock>
          </section>

          {Object.keys(item.refs ?? {}).length > 0 && (
            <section style={{ marginBottom: 'var(--space-lg)' }}>
              <h2
                className="t-title-md"
                style={{
                  color: 'var(--color-ink)',
                  marginBottom: 'var(--space-xs)',
                }}
              >
                Refs
              </h2>
              <CodeBlock>{JSON.stringify(item.refs, null, 2)}</CodeBlock>
            </section>
          )}

          <section>
            <h2
              className="t-title-md"
              style={{
                color: 'var(--color-ink)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              Raw message
            </h2>
            <CodeBlock>{JSON.stringify(item.message, null, 2)}</CodeBlock>
          </section>
        </>
      )}
    </>
  );
}
