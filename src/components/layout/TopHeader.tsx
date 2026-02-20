import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { Button } from '../ui/Button';

type TopHeaderProps = {
  leadingAction?: ReactNode;
};

function getInitials(nameOrEmail: string) {
  const parts = nameOrEmail.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function TopHeader({ leadingAction }: TopHeaderProps) {
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const { canInstall, promptInstall } = usePwaInstall();
  const displayName = user?.displayName || user?.email || 'User';

  return (
    <header className="fixed inset-x-0 top-0 z-20 border-b border-slate-800/70 bg-base/70 backdrop-blur-xl md:left-72">
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          {leadingAction}
          <div>
            <p className="font-display text-lg text-white">Operations Hub</p>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Live activity + auth</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {canInstall && (
            <Button variant="secondary" onClick={promptInstall}>
              Install App
            </Button>
          )}

          <div className="hidden items-center gap-3 rounded-2xl border border-slate-700/70 bg-panel px-3 py-2 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-glow/40 to-accent/40 text-xs font-semibold text-white">
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
