export default function StatsCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <article className="panel flex min-h-24 flex-col justify-between p-3">
      <div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div>
      <div>
        <div className="text-2xl font-bold leading-none tracking-[-.04em] text-ops-ink dark:text-[#eef3ec]">{value}</div>
        {hint && <div className="mt-1 text-[10px] text-ops-body dark:text-[#b3beb5]">{hint}</div>}
      </div>
    </article>
  );
}
