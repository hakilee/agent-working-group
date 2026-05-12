import { cn } from '../lib/cn';

export default function Corridor({ busy }: { busy?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2 md:w-6">
      {busy ? (
        <>
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-ops-rust" />
          <div className="h-px w-full border-t border-dashed border-ops-muted/40 dark:border-white/10" />
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-ops-green" style={{ animationDelay: '0.3s' }} />
        </>
      ) : (
        <div className="h-px w-full border-t border-dashed border-ops-muted/20 dark:border-white/5" />
      )}
    </div>
  );
}
