import { cn } from '../lib/cn';
import { useTheme, type ThemeMode } from '../theme';

const OPTIONS: Array<{ value: ThemeMode; label: string; hint: string }> = [
  { value: 'system', label: 'System', hint: 'Follow OS preference' },
  { value: 'light', label: 'Light', hint: 'Force light dashboard' },
  { value: 'dark', label: 'Dark', hint: 'Force dark dashboard' },
];

export default function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme();
  return (
    <fieldset className="grid gap-2">
      <legend className="eyebrow mb-2">Theme mode</legend>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex items-center gap-2 border border-ops-line bg-white/55 p-2 text-xs text-ops-body dark:border-white/15 dark:bg-white/5 dark:text-[#b3beb5]',
            mode === option.value && 'border-ops-green bg-emerald-50 text-ops-ink dark:border-emerald-300/60 dark:bg-emerald-400/10 dark:text-[#eef3ec]',
          )}
        >
          <input
            type="radio"
            name="theme-mode"
            value={option.value}
            checked={mode === option.value}
            onChange={() => setMode(option.value)}
            className="size-3 accent-ops-green"
          />
          <span className="grid gap-0.5">
            <span className="font-bold">{option.label}</span>
            <span className="caption">{option.hint}</span>
          </span>
        </label>
      ))}
      <p className="caption">Resolved now: {resolved}</p>
    </fieldset>
  );
}
