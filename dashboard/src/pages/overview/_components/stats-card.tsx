export default function StatsCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <article className="flex min-h-24 flex-col justify-between border border-ops-line bg-ops-panel p-3 shadow-[0_10px_28px_rgb(31_39_34/.08)] backdrop-blur-xl dark:border-white/15 dark:bg-[#1e2722]/85 dark:shadow-black/20">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-muted dark:text-[#839087]">{label}</div>
      <div>
        <div className="text-2xl font-bold leading-none tracking-[-.04em] text-ops-ink dark:text-[#eef3ec]">{value}</div>
        {hint && <div className="mt-1 text-[10px] text-ops-body dark:text-[#b3beb5]">{hint}</div>}
      </div>
    </article>
  );
}
