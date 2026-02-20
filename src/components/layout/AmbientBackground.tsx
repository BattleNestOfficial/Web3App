import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/cn';

type AmbientBackgroundProps = {
  className?: string;
  dense?: boolean;
};

export function AmbientBackground({ className, dense = false }: AmbientBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="ambient-grid absolute inset-0 opacity-55" />

      <motion.div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-300/18 blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, 18, -8, 0],
                y: [0, 24, 12, 0],
                scale: [1, 1.08, 0.98, 1]
              }
        }
        transition={{ duration: dense ? 8 : 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-400/16 blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -24, -10, 0],
                y: [0, 16, -10, 0],
                scale: [1, 0.95, 1.05, 1]
              }
        }
        transition={{ duration: dense ? 9 : 13, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-300/12 blur-3xl"
        animate={
          reduceMotion
            ? undefined
            : {
                x: [0, -14, 20, 0],
                y: [0, -12, -22, 0],
                rotate: [0, 8, -8, 0]
              }
        }
        transition={{ duration: dense ? 10 : 15, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_20%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_65%_75%,rgba(255,255,255,0.05),transparent_32%)]" />
    </div>
  );
}
