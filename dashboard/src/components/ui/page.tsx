import type { ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
  return <div className="page page-transition">{children}</div>;
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
    <header className="page-header min-h-12">
      <div className="page-title-stack">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="title-xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}
