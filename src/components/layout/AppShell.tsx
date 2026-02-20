import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const mobileMenuButton = (
    <button
      className="rounded-xl border border-slate-700/60 bg-panel p-2 text-slate-300 transition hover:text-white md:hidden"
      onClick={() => setIsSidebarOpen(true)}
      aria-label="Open sidebar"
    >
      <Menu className="h-5 w-5" />
    </button>
  );

  return (
    <div className="relative min-h-screen bg-base text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,247,204,0.12),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(0,163,255,0.12),transparent_30%)]" />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="relative md:pl-72">
        <TopHeader leadingAction={mobileMenuButton} />

        <main className="px-4 pb-8 pt-24 sm:px-6 lg:px-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
