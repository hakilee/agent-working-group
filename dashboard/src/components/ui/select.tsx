import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { controlSizeClass, type ControlSize } from './sizing';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ size = 'small', className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn('border border-ops-line bg-white/75 font-bold text-ops-ink outline-none transition focus:border-ops-green dark:border-white/15 dark:bg-black/20 dark:text-[#eef3ec]', controlSizeClass[size], className)}
      {...props}
    >
      {children}
    </select>
  );
});
