import { NavLink } from 'react-router-dom';
import { cn } from '../lib/cn';

const PRIMARY_NAV = [
  ['/', 'Overview', true],
  ['/queue', 'Queue'],
  ['/workers', 'Workers'],
  ['/liveness', 'Liveness'],
] as const;

const SETTINGS_NAV = ['/settings', 'Settings'] as const;

function SidebarLink({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
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
  );
}

export default function Sidebar() {
  const [settingsTo, settingsLabel] = SETTINGS_NAV;
  return (
    <aside className="flex border-b border-ops-line bg-white/60 p-3 backdrop-blur-2xl dark:border-white/15 dark:bg-[#202a25]/70 md:sticky md:top-0 md:h-dvh md:w-52 md:flex-col md:border-b-0 md:border-r">
      <div className="border-b border-ops-line px-1 pb-3 dark:border-white/15">
        <div className="text-lg font-bold tracking-[-.04em] text-ops-ink dark:text-[#eef3ec]">AWG</div>
        <div className="mt-0.5 text-[10px] text-ops-muted dark:text-[#839087]">operations dashboard</div>
      </div>
      <nav className="ml-3 grid flex-1 grid-cols-4 gap-1 md:ml-0 md:mt-3 md:grid-cols-1 md:content-start" aria-label="Primary">
        {PRIMARY_NAV.map(([to, label, end]) => <SidebarLink key={to} to={to} label={label} end={end} />)}
      </nav>
      <nav className="ml-1 grid gap-1 md:ml-0 md:mt-auto" aria-label="Settings">
        <SidebarLink to={settingsTo} label={settingsLabel} />
      </nav>
    </aside>
  );
}
