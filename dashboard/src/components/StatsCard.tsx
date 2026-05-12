export default function StatsCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <article className="panel flex min-h-36 flex-col justify-between p-5">
      <div className="eyebrow text-ops-muted dark:text-[#839087]">{label}</div>
      <div>
        <div className="text-5xl font-bold leading-none tracking-[-.07em] text-ops-ink dark:text-[#eef3ec]">{value}</div>
        {hint && <div className="mt-2 text-xs text-ops-body dark:text-[#b3beb5]">{hint}</div>}
      </div>
    </article>
  );
}
