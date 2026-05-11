import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/workers', label: 'Workers' },
];

export default function Layout() {
  return (
    <div className="min-h-full flex flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <div className="text-sm font-semibold tracking-wide text-emerald-400">AWG</div>
          <nav className="flex items-center gap-1 text-sm">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-slate-50'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs text-slate-600">
        agent-working-group dashboard
      </footer>
    </div>
  );
}
