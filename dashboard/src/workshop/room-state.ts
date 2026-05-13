import type { AgentSummary } from '../api/client';
import type { AgentRoom, RoomState } from './types';
import { getProfile } from './types';

const ROLE_ORDER: Record<string, number> = { lead: 0, worker: 1 };

export function deriveRooms(agents: AgentSummary[]): AgentRoom[] {
  if (!agents || agents.length === 0) return [];

  const sorted = [...agents].sort((a, b) => {
    const ao = ROLE_ORDER[a.agent] ?? 99;
    const bo = ROLE_ORDER[b.agent] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.agent.localeCompare(b.agent);
  });

  return sorted.map((agent) => {
    const counts = normalizeCounts(agent.counts);
    return {
      role: agent.agent,
      profile: getProfile(agent.agent),
      counts,
      state: deriveState(counts.pending, counts.processing, counts.dead),
    };
  });
}

function normalizeCounts(counts: AgentSummary['counts'] = {}): AgentRoom['counts'] {
  return {
    pending: numberOrZero(counts.pending),
    processing: numberOrZero(counts.processing),
    processed: numberOrZero(counts.processed),
    dead: numberOrZero(counts.dead),
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function deriveState(pending: number, processing: number, dead: number): RoomState {
  if (dead > 0) return 'blocked';
  if (processing > 0) return 'working';
  if (pending > 0) return 'dispatching';
  return 'idle';
}
