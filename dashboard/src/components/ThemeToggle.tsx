import { useTheme, type ThemeMode } from '../theme';

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <button className="action-btn w-full justify-center" type="button" onClick={() => setMode(NEXT[mode])} aria-label={`Theme: ${LABEL[mode]}`}>
      ◐ {LABEL[mode]}
    </button>
  );
}
