import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type TextVariant = 'eyebrow' | 'title-lg' | 'title-md' | 'title-sm' | 'body' | 'caption' | 'mono-caption';

const textVariantClass: Record<TextVariant, string> = {
  eyebrow: 'text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300',
  'title-lg': 'text-xl font-bold leading-tight tracking-[-.035em] text-ops-ink dark:text-[#eef3ec] md:text-2xl',
  'title-md': 'text-lg font-bold leading-tight tracking-[-.03em] text-ops-ink dark:text-[#eef3ec] md:text-xl',
  'title-sm': 'text-sm font-bold tracking-[-.01em] text-ops-ink dark:text-[#eef3ec]',
  body: 'text-xs leading-5 text-ops-body dark:text-[#b3beb5]',
  caption: 'text-[10px] text-ops-muted dark:text-[#839087]',
  'mono-caption': 'font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ops-green dark:text-emerald-300',
};

export function Text({ as, variant = 'body', className, children, ...props }: HTMLAttributes<HTMLElement> & { as?: 'p' | 'span' | 'div' | 'h1' | 'h2' | 'strong'; variant?: TextVariant; children: ReactNode }) {
  const Component = as ?? 'div';
  return <Component className={cn(textVariantClass[variant], className)} {...props}>{children}</Component>;
}
