import type { ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="dashboard-page mx-auto grid w-full max-w-[1240px] gap-4 [view-transition-name:dashboard-page]">
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex min-h-12 flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">{eyebrow}</div>
        <h1 className="text-xl font-bold leading-tight tracking-[-.035em] text-ops-ink dark:text-[#eef3ec] md:text-2xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}
