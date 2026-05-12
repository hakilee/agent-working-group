interface Props {
  label: string;
  value: number | string;
  hint?: string;
}

export default function StatsCard({ label, value, hint }: Props) {
  return (
    <article className="panel kpi-card">
      <div className="kpi-label">{label}</div>
      <div>
        <div className="kpi-value">{value}</div>
        {hint && <div className="kpi-hint">{hint}</div>}
      </div>
    </article>
  );
}
