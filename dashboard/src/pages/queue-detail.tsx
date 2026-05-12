import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type QueueDetail } from '../api/client';
import StatusPill from '../components/status-pill';
import { Page } from '../components/ui/page';
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
    <Page>
      <button type="button" onClick={() => navigate(-1)} className="inline-flex w-fit items-center gap-1.5 border border-transparent bg-[#ebe6da] px-2.5 py-1.5 text-xs font-bold text-ops-ink transition hover:border-ops-line hover:bg-emerald-50 dark:bg-white/10 dark:text-[#eef3ec] dark:hover:border-white/15 dark:hover:bg-emerald-400/15">
        <IconArrowLeft size={15} stroke={1.8} />Back
      </button>
      {error && <div role="alert" className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {!error && !item && <Empty>Loading message...</Empty>}
      {item && <>
        <header className="flex flex-wrap items-end justify-between gap-3 border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Queue Detail</div>
            <h1 className="text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl">{item.kind}</h1>
          </div>
          <StatusPill status={item.state} />
        </header>
        <section className="border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20 md:p-4">
          {getDetailRows(item).map(([label, value]) => <KV key={label} label={label} value={value} />)}
        </section>
        <Block title="Body">{item.body || '(empty)'}</Block>
        {hasRefs(item) && <Block title="Refs">{JSON.stringify(item.refs, null, 2)}</Block>}
        <Block title="Raw message">{JSON.stringify(item.message, null, 2)}</Block>
      </>}
    </Page>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-ops-line py-2 last:border-b-0 dark:border-white/15 md:grid-cols-[120px_1fr]">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-muted dark:text-[#839087]">{label}</div>
      <div className="break-words text-xs text-ops-ink dark:text-[#eef3ec]">{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]">{title}</h2>
      <pre className="overflow-auto whitespace-pre-wrap break-words border border-ops-line bg-white/75 p-3 font-mono text-[11px] leading-5 text-ops-ink dark:border-white/15 dark:bg-black/25 dark:text-[#eef3ec]">{children}</pre>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">{children}</div>;
}
