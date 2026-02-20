import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25',
        className
      )}
      {...props}
    />
  );
});

