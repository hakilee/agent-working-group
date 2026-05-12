import { useMemo } from 'react';
import { queueStreamUrl, type AgentSummary } from '../api/client';
import { useWebSocket } from './use-web-socket';

export interface QueueStreamFrame {
  type: 'queues';
  root: string;
  agents: AgentSummary[];
  counts: Record<string, number>;
  ts: number;
}

export function useQueueStream() {
  const url = useMemo(() => queueStreamUrl(), []);
  return useWebSocket<QueueStreamFrame>(url);
}
