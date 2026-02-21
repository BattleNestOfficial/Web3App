import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { recordAppActivity, type AppActivitySource } from '../../features/activity/log';
import { AmbientBackground } from './AmbientBackground';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const source = resolveActivitySourceFromPath(location.pathname);
    const label = resolveRouteLabel(location.pathname);
    void recordAppActivity({
      source,
      action: 'view_page',
      title: 'Page viewed',
      detail: label
    });
  }, [location.pathname]);

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

function resolveRouteLabel(pathname: string) {
  if (pathname.startsWith('/analytics')) return 'Analytics';
  if (pathname.startsWith('/nft-mints')) return 'NFT Mint Tracker';
  if (pathname.startsWith('/farming')) return 'Projects / Testnets';
  if (pathname.startsWith('/todo')) return 'To-Do';
  if (pathname.startsWith('/wallet-tracker')) return 'Wallet Tracker';
  if (pathname.startsWith('/bugs')) return 'Bug Tracker';
  if (pathname.startsWith('/api-costs')) return 'API Cost Tracker';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Overview';
}

function resolveActivitySourceFromPath(pathname: string): AppActivitySource {
  if (pathname.startsWith('/analytics')) return 'analytics';
  if (pathname.startsWith('/nft-mints')) return 'mint_tracker';
  if (pathname.startsWith('/farming')) return 'farming';
  if (pathname.startsWith('/todo')) return 'todo';
  if (pathname.startsWith('/wallet-tracker')) return 'wallet_tracker';
  if (pathname.startsWith('/bugs')) return 'bug_tracker';
  if (pathname.startsWith('/api-costs')) return 'analytics';
  if (pathname.startsWith('/settings')) return 'productivity';
  return 'productivity';
}
