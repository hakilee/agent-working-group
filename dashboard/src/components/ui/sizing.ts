export type ControlSize = 'x-small' | 'small' | 'medium' | 'large';

export const controlSizeClass: Record<ControlSize, string> = {
  'x-small': 'h-6 px-1.5 text-[10px]',
  small: 'h-8 px-2.5 text-xs',
  medium: 'h-9 px-3 text-sm',
  large: 'h-10 px-3.5 text-sm',
};
