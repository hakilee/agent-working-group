export type RoomState =
  | 'idle'
  | 'dispatching'
  | 'working'
  | 'reviewing'
  | 'responding'
  | 'blocked';

export interface AgentProfile {
  role: string;
  displayName: string;
  color: string;
}

export interface AgentRoom {
  role: string;
  profile: AgentProfile;
  counts: { pending: number; processing: number; processed: number; dead: number };
  state: RoomState;
}

export const KNOWN_PROFILES: Record<string, AgentProfile> = {
  lead: { role: 'lead', displayName: 'Lead', color: '#0f6b55' },
  worker: { role: 'worker', displayName: 'Worker', color: '#c87438' },
};

export function getProfile(role: string): AgentProfile {
  if (KNOWN_PROFILES[role]) return KNOWN_PROFILES[role];
  const palette = ['#2f5f9f', '#8b5cf6', '#dc2626', '#059669', '#d97706'];
  const idx = Math.abs(hashCode(role)) % palette.length;
  return {
    role,
    displayName: role.charAt(0).toUpperCase() + role.slice(1),
    color: palette[idx],
  };
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
