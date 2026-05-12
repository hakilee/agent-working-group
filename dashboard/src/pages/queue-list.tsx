import { IconArrowRight } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type QueueSummary } from '../api/client';
import StatusPill from '../components/status-pill';
import { Page, PageHeader } from '../components/ui/page';
import { QUEUE_CARD_PREVIEW_LENGTH, QUEUE_LIST_LIMIT } from '../dashboard-rules';
import { formatRouteParticipant } from '../format';
import { useQueueStream } from '../hooks/use-queue-stream';
import { cn } from '../lib/cn';

const FILTERS = ['all', 'pending', 'processing', 'processed', 'dead'] as const;
type Filter = (typeof FILTERS)[number];

const neutralPillClass = 'inline-flex items-center gap-1 whitespace-nowrap border border-transparent bg-[#ebe6da] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-ops-ink dark:bg-white/10 dark:text-[#eef3ec]';

function filterToQueueState(filter: Filter): QueueSummary['state'] | undefined {
  return filter === 'all' ? undefined : filter;
}

function getQueuePreview(body: string): string {
  return body.split('\n')[0].slice(0, QUEUE_CARD_PREVIEW_LENGTH) || '(empty)';
}

export default function QueueList() {
  const navigate = useNavigate();
  const stream = useQueueStream();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<QueueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    return api.listQueue({ state: filterToQueueState(filter), limit: QUEUE_LIST_LIMIT });
  }, [filter]);

  useEffect(() => {
    let ignoreResult = false;
    setLoading(true);

    loadQueue()
      .then((data) => {
        if (ignoreResult) return;
        setItems(data.items);
        setError(null);
      })
      .catch((e) => {
        if (!ignoreResult) setError(String(e));
      })
      .finally(() => {
        if (!ignoreResult) setLoading(false);
      });

    return () => { ignoreResult = true; };
  }, [loadQueue]);

  useEffect(() => {
    if (!stream) return;
    void loadQueue()
      .then((data) => {
        setItems(data.items);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [stream, loadQueue]);

  return (
    <Page>
      <PageHeader eyebrow="Queue" title="Work items">
        <QueueFilters activeFilter={filter} onChange={setFilter} />
      </PageHeader>
      {error && <div className="border border-rose-500 bg-rose-50/80 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      {loading && <Empty>Loading queue...</Empty>}
      {!loading && !error && !items.length && <Empty>No queue items.</Empty>}
      {!loading && !!items.length && (
        <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {items.map((item) => <QueueCard key={`${item.agent}/${item.filename}`} item={item} open={() => navigate(`/queue/${encodeURIComponent(item.id)}`)} />)}
        </ul>
      )}
    </Page>
  );
}

function QueueFilters({ activeFilter, onChange }: { activeFilter: Filter; onChange: (filter: Filter) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Queue filters">
      {FILTERS.map((filter) => {
        const isActive = activeFilter === filter;
        return (
          <button key={filter} type="button" className={cn('border border-ops-line px-2 py-1.5 text-xs font-bold transition dark:border-white/15', isActive ? 'bg-ops-green text-white' : 'text-ops-body hover:bg-black/5 dark:text-[#b3beb5] dark:hover:bg-white/10')} onClick={() => onChange(filter)}>
            {filter}
          </button>
        );
      })}
    </div>
  );
}

function QueueCard({ item, open }: { item: QueueSummary; open: () => void }) {
  return (
    <li>
      <button type="button" className="w-full border border-ops-line bg-ops-panel p-3 text-left text-inherit transition hover:border-black/25 hover:bg-white/95 dark:border-white/15 dark:bg-[#1e2722]/85 dark:hover:border-white/30 dark:hover:bg-[#243029]" onClick={open}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={neutralPillClass}>{item.kind}</span>
          <StatusPill status={item.state} />
          <time className="ml-auto text-[10px] text-ops-muted dark:text-[#839087]">{item.createdAt ?? '-'}</time>
        </div>
        <p className="mt-3 line-clamp-3 text-xs leading-5 text-ops-ink dark:text-[#eef3ec]">{getQueuePreview(item.body)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-ops-muted dark:text-[#839087]">
            {formatRouteParticipant(item.from)} <IconArrowRight size={12} stroke={1.8} /> {formatRouteParticipant(item.to)}
          </span>
          <span className="ml-auto text-[10px] text-ops-muted dark:text-[#839087]">{item.agent}</span>
        </div>
      </button>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed border-black/25 bg-ops-panel p-4 text-center text-xs text-ops-muted dark:border-white/25 dark:bg-[#1e2722]/85 dark:text-[#839087]">{children}</div>;
}
