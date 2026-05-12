import { Collapsible } from '@base-ui/react/collapsible';
import {
  IconChevronDown,
  IconHeartbeat,
  IconInbox,
  IconLayoutDashboard,
  IconMenu2,
  IconSettings,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../lib/cn';

type NavIcon = ComponentType<{ size?: number; stroke?: number; className?: string }>;

type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  end?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: IconLayoutDashboard, end: true },
  { to: '/queue', label: 'Queue', icon: IconInbox },
  { to: '/workers', label: 'Workers', icon: IconUsersGroup },
  { to: '/liveness', label: 'Liveness', icon: IconHeartbeat },
];

const SETTINGS_NAV: NavItem = { to: '/settings', label: 'Settings', icon: IconSettings };

function SidebarLink({ to, label, icon: Icon, end, onSelect }: NavItem & { onSelect?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onSelect}
      className={({ isActive }) => cn(
        'group flex items-center gap-2 border border-transparent px-2 py-2 text-xs font-bold text-ops-body transition hover:border-ops-line hover:bg-black/5 hover:text-ops-ink dark:text-[#b3beb5] dark:hover:border-white/15 dark:hover:bg-white/10 dark:hover:text-white',
        isActive && 'active border-ops-line bg-[#ebe6da] text-ops-ink dark:border-white/15 dark:bg-white/10 dark:text-white',
      )}
    >
      <Icon size={16} stroke={1.8} className="shrink-0 text-ops-muted group-[.active]:text-ops-green dark:text-[#839087] dark:group-[.active]:text-emerald-300" />
      <span className="min-w-0 truncate">{label}</span>
    </NavLink>
  );
}

function Brand() {
  return (
    <div className="min-w-0 px-1">
      <div className="text-lg font-bold tracking-[-.04em] text-ops-ink dark:text-[#eef3ec]">AWG</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[.08em] text-ops-muted dark:text-[#839087]">operations dashboard</div>
    </div>
  );
}

function NavGroups({ onSelect }: { onSelect?: () => void }) {
  return (
    <>
      <nav className="grid gap-1" aria-label="Primary">
        {PRIMARY_NAV.map((item) => <SidebarLink key={item.to} {...item} onSelect={onSelect} />)}
      </nav>
      <nav className="grid gap-1 md:mt-auto" aria-label="Settings">
        <SidebarLink {...SETTINGS_NAV} onSelect={onSelect} />
      </nav>
    </>
  );
}

function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="relative z-40 border-b border-ops-line bg-white/70 p-3 backdrop-blur-2xl dark:border-white/15 dark:bg-[#202a25]/75 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Brand />
        <Collapsible.Trigger className="action-btn min-h-9" aria-label="Toggle dashboard navigation">
          <IconMenu2 size={17} stroke={1.9} />
          <span>Menu</span>
          <IconChevronDown size={15} stroke={1.9} className={cn('transition-transform duration-150', open && 'rotate-180')} />
        </Collapsible.Trigger>
      </div>
      <Collapsible.Panel keepMounted className="mobile-nav-panel absolute left-3 right-3 top-[calc(100%-1px)] border border-ops-line bg-ops-panel p-3 shadow-[0_18px_50px_rgb(31_39_34/.18)] backdrop-blur-2xl data-[closed]:hidden dark:border-white/15 dark:bg-[#1e2722]/95 dark:shadow-black/35">
        <div className="grid gap-1">
          <NavGroups onSelect={() => setOpen(false)} />
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

function DesktopSidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-52 flex-col border-r border-ops-line bg-white/60 p-3 backdrop-blur-2xl dark:border-white/15 dark:bg-[#202a25]/70 md:flex">
      <div className="border-b border-ops-line pb-3 dark:border-white/15"><Brand /></div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1">
        <NavGroups />
      </div>
    </aside>
  );
}

export default function Sidebar() {
  return (
    <>
      <MobileSidebar />
      <DesktopSidebar />
    </>
  );
}
