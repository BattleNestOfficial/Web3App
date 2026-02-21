import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-6 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-700/70 bg-panel p-8 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">404</p>
        <h1 className="mt-2 font-display text-2xl text-white">Page not found</h1>
        <p className="mt-2 text-sm text-slate-300">The requested route is not available in this Web3OS workspace.</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex rounded-xl border border-glow/70 bg-gradient-to-r from-glow/20 to-accent/20 px-4 py-2 text-sm font-medium text-white transition hover:from-glow/30 hover:to-accent/30"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
