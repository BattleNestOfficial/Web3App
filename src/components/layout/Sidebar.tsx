import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bug,
  CalendarClock,
  Gauge,
  ListTodo,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sprout,
  Wallet,
  X
} from 'lucide-react';
import { useMemo, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

type SidebarSection = 'Command' | 'Execution' | 'System';

type SidebarItem = {
  label: string;
  to: string;
  icon: typeof Gauge;
  section: SidebarSection;
};

const items: SidebarItem[] = [
  { label: 'Overview', to: '/dashboard', icon: Gauge, section: 'Command' },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, section: 'Command' },
  { label: 'Wallet Tracker', to: '/wallet-tracker', icon: Wallet, section: 'Command' },
  { label: 'NFT Mint Scheduler', to: '/nft-mints', icon: CalendarClock, section: 'Execution' },
  { label: 'Projects / Testnets', to: '/farming', icon: Sprout, section: 'Execution' },
  { label: 'To-Do Ops', to: '/todo', icon: ListTodo, section: 'Execution' },
  { label: 'Bug Tracker', to: '/bugs', icon: Bug, section: 'System' },
  { label: 'API Cost Tracker', to: '/api-costs', icon: ReceiptText, section: 'System' },
  { label: 'Settings', to: '/settings', icon: Settings, section: 'System' }
];

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

const navContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const navItemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0 }
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const groupedItems = useMemo(
    () =>
      (['Command', 'Execution', 'System'] as SidebarSection[]).map((section) => ({
        section,
        rows: items.filter((item) => item.section === section)
      })),
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-800/70 bg-panel/95 backdrop-blur-xl md:block">
        <div className="flex h-full flex-col px-6 py-5">
          <div className="mb-8">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-200" />
              <p className="font-display text-lg font-semibold tracking-wide text-white">BattleNest Web3OS</p>
            </div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Autonomous Mission Core</p>
          </div>

          <motion.nav variants={navContainerVariants} initial="hidden" animate="show" className="space-y-4">
            {groupedItems.map((group) => (
              <div key={`desktop-group-${group.section}`}>
                <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">{group.section}</p>
                <div className="space-y-2">
                  {group.rows.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={`desktop-${item.to}`}
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-sm transition',
                            isActive
                              ? 'border-glow/60 bg-glow/12 text-white shadow-glow'
                              : 'border-slate-800/80 bg-panelAlt text-slate-300 hover:border-slate-600 hover:text-white'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <motion.div variants={navItemVariants} className="relative flex w-full items-center gap-3">
                            {isActive ? (
                              <motion.span
                                layoutId="desktop-nav-active-pill"
                                className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-red-400/22 to-rose-500/22"
                                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                              />
                            ) : null}
                            <Icon className="h-4 w-4 transition group-hover:scale-105" />
                            <span>{item.label}</span>
                          </motion.div>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.nav>
        </div>
      </aside>

      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm md:hidden"
              onClick={onClose}
              aria-label="Close menu overlay"
            />

            <motion.aside
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 210, damping: 28 }}
              className="fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-800/70 bg-panel/95 backdrop-blur-xl md:hidden"
            >
              <div className="flex h-full flex-col px-6 py-5">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-cyan-200" />
                      <p className="font-display text-lg font-semibold tracking-wide text-white">BattleNest Web3OS</p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Autonomous Mission Core</p>
                  </div>
                  <button
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 md:hidden"
                    onClick={onClose}
                    aria-label="Close sidebar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <motion.nav variants={navContainerVariants} initial="hidden" animate="show" className="space-y-4">
                  {groupedItems.map((group) => (
                    <div key={`mobile-group-${group.section}`}>
                      <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">{group.section}</p>
                      <div className="space-y-2">
                        {group.rows.map((item) => {
                          const Icon = item.icon;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              onClick={onClose}
                              className={({ isActive }) =>
                                cn(
                                  'group relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-sm transition',
                                  isActive
                                    ? 'border-glow/60 bg-glow/10 text-white shadow-glow'
                                    : 'border-slate-800/80 bg-panelAlt text-slate-300 hover:border-slate-600 hover:text-white'
                                )
                              }
                            >
                              {({ isActive }) => (
                                <motion.div variants={navItemVariants} className="relative flex w-full items-center gap-3">
                                  {isActive ? (
                                    <motion.span
                                      layoutId="mobile-nav-active-pill"
                                      className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-red-400/22 to-rose-500/22"
                                      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                                    />
                                  ) : null}
                                  <Icon className="h-4 w-4 transition group-hover:scale-105" />
                                  <span>{item.label}</span>
                                </motion.div>
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </motion.nav>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="sr-only" aria-live="polite">
        {isOpen ? 'Sidebar opened' : 'Sidebar closed'}
      </div>
    </>
  );
}
