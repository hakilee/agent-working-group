import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div className="page" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.14, ease: 'easeOut' }}>
      {children}
    </motion.div>
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
    <header className="page-header min-h-12">
      <div className="page-title-stack">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="title-xl">{title}</h1>
      </div>
      {children}
    </header>
  );
}
