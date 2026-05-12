import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';
import ThemeToggle from './ThemeToggle';

const NAV = [
  ['/', 'Overview', true],
  ['/queue', 'Queue'],
  ['/workers', 'Workers'],
  ['/liveness', 'Liveness'],
] as const;

export default function Sidebar() {
  return (
    <aside className="border-b border-ops-line bg-white/60 p-4 backdrop-blur-2xl dark:border-white/15 dark:bg-[#202a25]/70 md:sticky md:top-0 md:h-dvh md:w-64 md:border-b-0 md:border-r md:p-5">
      <div className="border-b border-ops-line px-2 pb-5 dark:border-white/15">
        <div className="text-2xl font-bold tracking-[-.06em] text-ops-ink dark:text-[#eef3ec]">AWG</div>
        <div className="mt-1 text-xs text-ops-muted dark:text-[#839087]">operations dashboard</div>
      </div>
      <nav className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-1" aria-label="Primary">
        {NAV.map(([to, label, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cn(
              'group flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold text-ops-body transition hover:bg-black/5 hover:text-ops-ink dark:text-[#b3beb5] dark:hover:bg-white/10 dark:hover:text-white md:justify-start',
              isActive && 'active bg-[#ebe6da] text-ops-ink dark:bg-white/10 dark:text-white',
            )}
          >
            <span className="hidden size-2 rounded-full bg-black/20 group-[.active]:bg-ops-green md:block" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-5 md:absolute md:inset-x-5 md:bottom-5"><ThemeToggle /></div>
    </aside>
  );
}
