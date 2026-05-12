import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
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
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ops-green dark:text-emerald-300">Theme mode</div>
        <p className="text-[10px] text-ops-muted dark:text-[#839087]">Resolved now: {resolved}</p>
      </div>
      <RadioGroup
        aria-label="Theme mode"
        value={mode}
        onValueChange={(next) => setMode(next as ThemeMode)}
        className="grid gap-2"
      >
        {OPTIONS.map((option) => {
          const isActive = mode === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-center gap-3 border border-ops-line bg-white/55 p-2.5 text-xs text-ops-body transition dark:border-white/15 dark:bg-white/5 dark:text-[#b3beb5]',
                isActive && 'border-ops-green bg-emerald-50 text-ops-ink dark:border-emerald-300/60 dark:bg-emerald-400/10 dark:text-[#eef3ec]',
              )}
            >
              <Radio.Root value={option.value} className="grid size-4 shrink-0 place-items-center border border-current">
                <Radio.Indicator className="size-2 bg-current" />
              </Radio.Root>
              <span className="grid min-w-0 gap-1">
                <span className="font-bold leading-none">{option.label}</span>
                <span className="text-[10px] leading-none text-ops-muted dark:text-[#839087]">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}
