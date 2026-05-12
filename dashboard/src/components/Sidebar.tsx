import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';

const NAV = [
  ['/', 'Overview', true],
  ['/queue', 'Queue'],
  ['/workers', 'Workers'],
  ['/liveness', 'Liveness'],
  ['/settings', 'Settings'],
] as const;

export default function Sidebar() {
  return (
    <aside className="border-b border-ops-line bg-white/60 p-3 backdrop-blur-2xl dark:border-white/15 dark:bg-[#202a25]/70 md:sticky md:top-0 md:h-dvh md:w-52 md:border-b-0 md:border-r">
      <div className="border-b border-ops-line px-1 pb-3 dark:border-white/15">
        <div className="text-lg font-bold tracking-[-.04em] text-ops-ink dark:text-[#eef3ec]">AWG</div>
        <div className="mt-0.5 text-[10px] text-ops-muted dark:text-[#839087]">operations dashboard</div>
      </div>
      <nav className="mt-3 grid grid-cols-3 gap-1 md:grid-cols-1" aria-label="Primary">
        {NAV.map(([to, label, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'group flex items-center justify-center gap-1.5 border border-transparent px-2 py-2 text-xs font-bold text-ops-body transition hover:border-ops-line hover:bg-black/5 hover:text-ops-ink dark:text-[#b3beb5] dark:hover:border-white/15 dark:hover:bg-white/10 dark:hover:text-white md:justify-start',
              isActive && 'active border-ops-line bg-[#ebe6da] text-ops-ink dark:border-white/15 dark:bg-white/10 dark:text-white',
            )}
          >
            <span className="hidden size-1.5 bg-black/20 group-[.active]:bg-ops-green md:block" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
