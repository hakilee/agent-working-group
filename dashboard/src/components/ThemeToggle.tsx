import { useTheme, type ThemeMode } from '../theme';

const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON: Record<ThemeMode, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

const LABEL: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      aria-label={`Theme: ${LABEL[mode]} (click to cycle)`}
      title={`Theme: ${LABEL[mode]}`}
      className="t-button"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-xs)',
        padding: 'var(--space-xs) var(--space-sm)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--color-body)',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-canvas-soft)';
        e.currentTarget.style.color = 'var(--color-ink)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--color-body)';
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{ICON[mode]}</span>
      <span>{LABEL[mode]}</span>
    </button>
  );
}
