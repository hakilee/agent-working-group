const STYLES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  processing: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  processed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  dead: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? 'bg-slate-500/15 text-slate-300 ring-slate-500/30';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {status}
    </span>
  );
}
