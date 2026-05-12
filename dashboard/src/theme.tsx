import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'awg.theme';

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (osPrefersDark() ? 'dark' : 'light') : mode;
}

function apply(mode: ThemeMode, resolved = resolveTheme(mode)): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-mode', mode);
}

// Apply once on module load so the page mounts in the right theme before
// React renders, preventing a light-to-dark flash.
if (typeof document !== 'undefined') apply(readStored());

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function osPrefersDark(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());
  const [osDark, setOsDark] = useState<boolean>(() => osPrefersDark());

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (osDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    apply(mode, resolved);
  }, [mode, resolved]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setOsDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
