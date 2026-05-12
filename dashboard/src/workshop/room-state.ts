import type { AgentSummary } from '../api/client';
import type { AgentRoom, RoomState } from './types';
import { getProfile } from './types';

export function deriveRooms(agents: AgentSummary[]): AgentRoom[] {
  if (!agents || agents.length === 0) return [];

  const sorted = [...agents].sort((a, b) => {
    const order: Record<string, number> = { lead: 0, worker: 1 };
    const ao = order[a.agent] ?? 99;
    const bo = order[b.agent] ?? 99;
    if (ao !== bo) return ao - bo;
    return a.agent.localeCompare(b.agent);
  });

  return sorted.map((ag) => {
    const profile = getProfile(ag.agent);
    const c = ag.counts ?? {};
    const pending = (c['pending'] as number) ?? 0;
    const processing = (c['processing'] as number) ?? 0;
    const processed = (c['processed'] as number) ?? 0;
    const dead = (c['dead'] as number) ?? 0;
    const state = deriveState(pending, processing, dead);
    return { role: ag.agent, profile, counts: { pending, processing, processed, dead }, state, latestBody: null };
  });
}

function deriveState(pending: number, processing: number, dead: number): RoomState {
  if (dead > 0) return 'blocked';
  if (processing > 0) return 'working';
  if (pending > 0) return 'dispatching';
  return 'idle';
}
