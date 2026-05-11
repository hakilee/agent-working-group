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

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'awg.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function applyMode(mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.seed = '';
  if (mode === 'dark') root.dataset.seedColorMode = 'dark-only';
  else if (mode === 'light') root.dataset.seedColorMode = 'light-only';
  else root.dataset.seedColorMode = 'system';
}

function applyOsScheme(): 'light' | 'dark' {
  const matches = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const scheme: 'light' | 'dark' = matches ? 'dark' : 'light';
  document.documentElement.dataset.seedUserColorScheme = scheme;
  return scheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [osScheme, setOsScheme] = useState<'light' | 'dark'>(() =>
    typeof window === 'undefined' || !window.matchMedia
      ? 'light'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
  );

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setOsScheme(applyOsScheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setOsScheme(applyOsScheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? osScheme : mode;

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
