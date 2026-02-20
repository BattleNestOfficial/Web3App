import { motion } from 'framer-motion';
import { Gauge, Layers, Settings, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

const items = [
  { label: 'Overview', to: '/dashboard', icon: Gauge },
  { label: 'Projects', to: '/projects', icon: Layers },
  { label: 'Settings', to: '/settings', icon: Settings }
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-800/70 bg-panel/95 backdrop-blur-xl md:block">
        <div className="flex h-full flex-col px-6 py-5">
          <div className="mb-8">
            <p className="font-display text-lg font-semibold tracking-wide text-white">Neon Console</p>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Mission Control</p>
          </div>

          <nav className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={`desktop-${item.to}`}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition',
                      isActive
                        ? 'border-glow/60 bg-glow/10 text-white shadow-glow'
                        : 'border-slate-800/80 bg-panelAlt text-slate-300 hover:border-slate-600 hover:text-white'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -320 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-800/70 bg-panel/95 backdrop-blur-xl md:hidden"
      >
        <div className="flex h-full flex-col px-6 py-5">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-semibold tracking-wide text-white">Neon Console</p>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Mission Control</p>
            </div>
            <button
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 md:hidden"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition',
                      isActive
                        ? 'border-glow/60 bg-glow/10 text-white shadow-glow'
                        : 'border-slate-800/80 bg-panelAlt text-slate-300 hover:border-slate-600 hover:text-white'
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </motion.aside>

      {isOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-label="Close menu overlay"
        />
      )}
    </>
  );
}
