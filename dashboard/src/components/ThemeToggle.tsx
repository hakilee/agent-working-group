import { ActionButton } from '@seed-design/react';
import { useTheme, type ThemeMode } from '../theme/ThemeContext';

const NEXT: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const ICON: Record<ThemeMode, string> = {
  system: '⌬',
  light: '☀',
  dark: '☾',
};

const LABEL: Record<ThemeMode, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <ActionButton
      variant="ghost"
      size="small"
      onClick={() => setMode(NEXT[mode])}
      aria-label={`Switch theme (current: ${LABEL[mode]})`}
      title={LABEL[mode]}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{ICON[mode]}</span>
    </ActionButton>
  );
}
