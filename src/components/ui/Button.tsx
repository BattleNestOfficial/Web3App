import { type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const variantClasses: Record<Variant, string> = {
  primary:
    'border-glow/70 bg-gradient-to-r from-glow/20 to-accent/20 text-white hover:from-glow/30 hover:to-accent/30 hover:shadow-glow',
  secondary: 'border-slate-600 bg-panelAlt text-slate-100 hover:border-slate-500',
  ghost: 'border-transparent bg-transparent text-slate-300 hover:border-slate-700 hover:bg-panel'
};

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl border px-4 py-2 text-sm font-medium transition duration-200 before:absolute before:inset-y-0 before:left-[-120%] before:w-1/2 before:skew-x-[-20deg] before:bg-white/15 before:opacity-0 before:transition before:duration-500 hover:before:left-[140%] hover:before:opacity-100 focus:outline-none focus:ring-2 focus:ring-glow/40 disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
