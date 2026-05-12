import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ size = 'small', className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn('w-full border border-ops-line bg-white/75 font-medium text-ops-ink outline-none transition placeholder:text-ops-muted focus:border-ops-green dark:border-white/15 dark:bg-black/20 dark:text-[#eef3ec]', controlSizeClass[size], className)}
      {...props}
    />
  );
});
