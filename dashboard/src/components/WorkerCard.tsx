import {
  HStack,
  ListContent,
  ListDetail,
  ListItem,
  ListSuffix,
  ListTitle,
  Text,
} from '@seed-design/react';
import type { WorkerSession } from '../api/client';
import StatusBadge from './StatusBadge';
import { useFlow } from '../stackflow';

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function WorkerCard({ worker }: { worker: WorkerSession }) {
  const flow = useFlow();
  return (
    <ListItem asChild highlighted={worker.attached}>
      <button
        type="button"
        onClick={() => flow.push('WorkerTerminal', { session: worker.session })}
        style={{
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          background: 'transparent',
          border: 0,
        }}
      >
        <ListContent>
        <ListTitle>
          <Text textStyle="t5Bold" className="awg-mono">
            {worker.session}
          </Text>
        </ListTitle>
        <ListDetail>
          <HStack gap="12px" wrap="wrap">
            <Text textStyle="t7Regular" color="fg.neutralMuted">
              uptime {formatUptime(worker.uptimeSeconds)}
            </Text>
            <Text textStyle="t7Regular" color="fg.neutralMuted">
              windows {worker.windows}
            </Text>
            <Text textStyle="t7Regular" color="fg.neutralMuted">
              {worker.status}
            </Text>
          </HStack>
        </ListDetail>
      </ListContent>
        <ListSuffix>
          <StatusBadge status={worker.attached ? 'fresh' : 'pending'} />
        </ListSuffix>
      </button>
    </ListItem>
  );
}
