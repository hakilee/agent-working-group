import { SECONDS_PER_HOUR, SECONDS_PER_MINUTE } from './dashboard-rules';

export function formatNullable(value: unknown, fallback = '—'): string {
  return value == null || value === '' ? fallback : String(value);
}

export function formatRouteParticipant(value: string | null): string {
  return formatNullable(value, '?');
}

export function formatUptime(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds >= SECONDS_PER_HOUR) return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ${Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)}m`;
  if (seconds >= SECONDS_PER_MINUTE) return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ${seconds % SECONDS_PER_MINUTE}s`;
  return `${seconds}s`;
}
