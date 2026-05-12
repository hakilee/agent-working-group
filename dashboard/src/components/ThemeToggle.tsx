import { useTheme, type ThemeMode } from '../theme';

const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
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
      className="theme-btn"
    >
      <span aria-hidden>◐</span>
      <span>{LABEL[mode]}</span>
    </button>
  );
}
