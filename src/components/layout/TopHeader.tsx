import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { Button } from '../ui/Button';

type TopHeaderProps = {
  leadingAction?: ReactNode;
};

function getInitials(nameOrEmail: string) {
  const tokens = nameOrEmail.split(/[\s@._-]+/).filter(Boolean);
  if (tokens.length === 0) return 'U';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

function getPageMeta(pathname: string) {
  if (pathname.startsWith('/dashboard')) return { title: 'Operations Hub', subtitle: 'Realtime overview' };
  if (pathname.startsWith('/analytics')) return { title: 'Analytics Matrix', subtitle: 'Behavior + trend intelligence' };
  if (pathname.startsWith('/mints')) return { title: 'Mint Tracker', subtitle: 'Mints, reminders, countdowns' };
  if (pathname.startsWith('/farming'))
    return { title: 'Projects / Testnets', subtitle: 'Track projects, testnets, tasks, and claim windows' };
  if (pathname.startsWith('/productivity')) return { title: 'Productivity', subtitle: 'Tasks and board execution flow' };
  if (pathname.startsWith('/todo')) return { title: 'To-Do', subtitle: 'Personal task execution center' };
  if (pathname.startsWith('/wallet-tracker'))
    return { title: 'Wallet Tracker', subtitle: 'Track OpenSea buy/sell/mint events with alerts' };
  if (pathname.startsWith('/bugs')) return { title: 'Bug Tracker', subtitle: 'Issue lifecycle and triage flow' };
  if (pathname.startsWith('/projects')) return { title: 'Projects', subtitle: 'Project-level workspace control' };
  if (pathname.startsWith('/settings')) return { title: 'Settings', subtitle: 'Configuration and account controls' };
  return { title: 'Crimson Console', subtitle: 'Mission control' };
}

export function TopHeader({ leadingAction }: TopHeaderProps) {
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { canInstall, promptInstall } = usePwaInstall();
  const displayName = user?.displayName || user?.email || 'User';
  const [utcNow, setUtcNow] = useState(() => new Date());
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const pageMeta = useMemo(() => getPageMeta(location.pathname), [location.pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUtcNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-slate-800/70 bg-base/70 backdrop-blur-xl md:left-72">
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          {leadingAction}
          <div>
            <p className="font-display text-lg text-white">{pageMeta.title}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{pageMeta.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-3 rounded-2xl border border-slate-700/70 bg-panel/70 px-3 py-2 lg:flex">
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-300' : 'bg-rose-300'}`} />
            <p className="text-xs uppercase tracking-[0.12em] text-slate-300">
              {isOnline ? 'Online' : 'Offline'} | UTC {utcNow.toLocaleTimeString('en-GB', { hour12: false })}
            </p>
          </div>

          {canInstall && (
            <Button variant="secondary" onClick={promptInstall}>
              Install App
            </Button>
          )}

          <div className="flex items-center gap-3 rounded-2xl border border-slate-700/70 bg-panel px-3 py-2">
            <div className="glow-ring flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-glow/40 to-accent/40 text-xs font-semibold text-white">
              {getInitials(displayName)}
            </div>
            <div className="text-left">
              <p className="max-w-36 truncate text-sm text-white">{displayName}</p>
              <p className="max-w-36 truncate text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>

          <Button
            variant="ghost"
            className="px-3"
            onClick={async () => {
              await signOutUser();
              navigate('/auth', { replace: true });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
