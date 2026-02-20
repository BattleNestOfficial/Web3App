import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AmbientBackground } from './AmbientBackground';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const mobileMenuButton = (
    <button
      className="rounded-xl border border-slate-700/60 bg-panel/80 p-2 text-slate-300 transition hover:border-cyan-300/40 hover:text-white md:hidden"
      onClick={() => setIsSidebarOpen(true)}
      aria-label="Open sidebar"
    >
      <Menu className="h-5 w-5" />
    </button>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen bg-base text-slate-100">
        <AmbientBackground />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className="relative md:pl-72">
          <TopHeader leadingAction={mobileMenuButton} />

          <main className="px-4 pb-8 pt-24 sm:px-6 lg:px-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.99 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.995 }}
                transition={{ type: 'spring', stiffness: 180, damping: 24, mass: 0.6 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
