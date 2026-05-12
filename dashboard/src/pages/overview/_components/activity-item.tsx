import { IconArrowRight } from '@tabler/icons-react';
import type { SystemStatus } from '../../../api/client';
import StatusPill from '../../../components/status-pill';
import { Badge } from '../../../components/ui/badge';

type Entry = SystemStatus['recentActivity'][number];

export default function ActivityItem({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full gap-2 border-b border-ops-line p-3 text-left transition last:border-b-0 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5 max-sm:block"
        onClick={onOpen}
      >
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={entry.state ?? 'processed'} />
            <Badge className="normal-case tracking-normal">{entry.kind ?? 'message'}</Badge>
            <span className="inline-flex items-center gap-1 text-[10px] text-ops-muted dark:text-[#839087]">
              {entry.from ?? '?'} <IconArrowRight size={12} stroke={1.8} /> {entry.to ?? '?'}
            </span>
          </div>
          <p className="break-words text-xs leading-5 text-ops-body dark:text-[#b3beb5]">{entry.body}</p>
        </div>
        <time className="shrink-0 text-[10px] text-ops-muted dark:text-[#839087]">{entry.createdAt ?? '-'}</time>
      </button>
    </li>
  );
}
