import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/workers', label: 'Workers' },
  { to: '/liveness', label: 'Liveness' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AWG</div>
        <div className="brand-subtitle">operations dashboard</div>
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {entry.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  );
}
