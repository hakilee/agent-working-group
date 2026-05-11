import { NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/queue', label: 'Queue' },
  { to: '/workers', label: 'Workers' },
  { to: '/liveness', label: 'Liveness' },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: 'var(--sidebar-width)',
        flex: '0 0 var(--sidebar-width)',
        background: 'var(--color-surface-card)',
        borderRight: '1px solid var(--color-hairline)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-lg) 0',
        position: 'sticky',
        top: 0,
        height: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          padding: '0 var(--space-lg) var(--space-lg)',
          borderBottom: '1px solid var(--color-hairline-soft)',
          marginBottom: 'var(--space-base)',
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-xs)',
        }}
      >
        <span
          className="t-display-sm"
          style={{ color: 'var(--color-ink)' }}
        >
          AWG
        </span>
        <span
          className="t-caption"
          style={{ color: 'var(--color-muted)' }}
        >
          dashboard
        </span>
      </div>

      <nav
        aria-label="Primary"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}
      >
        {NAV.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.end}
            className="t-nav-link"
            style={({ isActive }) => ({
              display: 'block',
              padding: '8px 16px',
              borderLeft: `2px solid ${isActive ? 'var(--color-primary)' : 'transparent'}`,
              color: isActive ? 'var(--color-ink)' : 'var(--color-muted)',
              transition: 'color 0.15s, border-color 0.15s',
            })}
          >
            {entry.label}
          </NavLink>
        ))}
      </nav>

      <div
        style={{
          padding: 'var(--space-base) var(--space-lg) 0',
          borderTop: '1px solid var(--color-hairline-soft)',
          marginTop: 'var(--space-base)',
        }}
      >
        <ThemeToggle />
      </div>
    </aside>
  );
}
