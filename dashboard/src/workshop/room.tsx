import type { AgentRoom } from './types';
import { cn } from '../lib/cn';

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  dispatching: 'Dispatching',
  working: 'Working',
  reviewing: 'Reviewing',
  responding: 'Responding',
  blocked: 'Blocked',
};

const STATE_COLORS: Record<string, string> = {
  idle: 'bg-gray-300 dark:bg-gray-600',
  dispatching: 'bg-ops-blue',
  working: 'bg-ops-green',
  reviewing: 'bg-ops-rust',
  responding: 'bg-ops-rust',
  blocked: 'bg-red-500',
};

export default function RoomCard({ room }: { room: AgentRoom }) {
  const { profile, state, counts } = room;

  return (
    <div
      className="relative flex min-h-56 flex-col rounded-none border-2 bg-white/60 p-3 backdrop-blur dark:bg-white/5"
      style={{ borderColor: profile.color, imageRendering: 'pixelated' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ops-line pb-2 dark:border-white/10">
        <span className="text-2xl leading-none" role="img" aria-label={profile.displayName}>
          {profile.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ops-ink dark:text-white">
            {profile.displayName}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-ops-muted dark:text-[#839087]">
            {profile.role}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 text-[10px] font-bold uppercase text-white',
            STATE_COLORS[state],
          )}
        >
          {STATE_LABELS[state]}
        </span>
      </div>

      {/* Character area */}
      <div className="flex flex-1 items-center justify-center py-3">
        <div
          className={cn(
            'flex h-20 w-16 flex-col items-center justify-center font-mono transition-all duration-300',
            state === 'idle' && 'animate-pulse-subtle',
            state === 'working' && 'animate-bounce-subtle',
            state === 'blocked' && 'animate-flash',
          )}
          role="img"
          aria-label={`${profile.displayName} is ${STATE_LABELS[state]}`}
        >
          {/* Pixel character body */}
          <div className="relative">
            {/* Head */}
            <div
              className="h-5 w-5 rounded-none border-2 border-black/20"
              style={{ backgroundColor: profile.color }}
            />
            {/* Body */}
            <div
              className="mx-auto h-6 w-6 rounded-none border-2 border-black/20 -mt-0.5"
              style={{ backgroundColor: profile.color, opacity: 0.85 }}
            />
            {/* Arms indicator for working state */}
            {state === 'working' && (
              <div className="absolute -right-2 top-3 text-[8px]">⚡</div>
            )}
            {state === 'blocked' && (
              <div className="absolute -right-2 top-3 text-[8px]">❌</div>
            )}
          </div>
          <span className="mt-1 text-[10px] text-ops-muted dark:text-[#839087]">
            {profile.emoji}
          </span>
        </div>
      </div>

      {/* Counts bar */}
      <div className="flex items-center gap-2 border-t border-ops-line pt-2 text-[10px] dark:border-white/10">
        <CountBadge label="Pending" value={counts.pending} color="bg-ops-blue" />
        <CountBadge label="Active" value={counts.processing} color="bg-ops-green" />
        <CountBadge label="Done" value={counts.processed} color="bg-gray-400 dark:bg-gray-600" />
        <CountBadge label="Dead" value={counts.dead} color="bg-red-500" />
      </div>

      {/* Pixel grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(0deg, currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

function CountBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className={cn('inline-block h-2 w-2 rounded-none', color)} />
      <span className="text-ops-muted dark:text-[#839087]">
        {value}
      </span>
      <span className="hidden text-ops-muted dark:text-[#839087] sm:inline">{label}</span>
    </span>
  );
}
