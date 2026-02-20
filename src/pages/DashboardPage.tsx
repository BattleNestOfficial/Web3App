import { motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, Clock3, Sparkles, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

const taskItems = [
  { label: 'Review mint allowlist', done: true },
  { label: 'Post launch countdown update', done: true },
  { label: 'Finalize collection metadata', done: false },
  { label: 'Publish teaser on social', done: false }
];

const timelineItems = [
  { time: '09:15', title: 'Whitelist snapshot generated', detail: '2,304 wallets synced' },
  { time: '10:40', title: 'Mint page performance check', detail: 'LCP improved by 18%' },
  { time: '12:10', title: 'Community sync call', detail: 'Roadmap and reveal date confirmed' },
  { time: '14:05', title: 'Treasury alert review', detail: 'No anomalies detected' }
];

const chartBars = [28, 40, 35, 48, 57, 52, 68, 62, 74, 71, 79, 84];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const }
  }
};

function GlassCard({
  title,
  icon,
  children,
  className = ''
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.article
      variants={item}
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6 ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg text-white">{title}</h3>
        {icon ? <div className="text-slate-300">{icon}</div> : null}
      </div>
      {children}
    </motion.article>
  );
}

export function DashboardPage() {
  return (
    <section className="mx-auto max-w-7xl">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Welcome back, Operator</h2>
      </motion.header>

      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12">
        <GlassCard title="Welcome Card" icon={<Sparkles className="h-4 w-4" />} className="lg:col-span-7">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/15 to-blue-500/10 p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
            <p className="text-sm text-slate-200">Your launch runway looks healthy. Pre-mint engagement is trending up.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
                7 days until public mint
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200">
                83% checklist complete
              </span>
            </div>
          </div>
        </GlassCard>

        <GlassCard
          title="Upcoming Mint"
          icon={<CalendarClock className="h-4 w-4" />}
          className="lg:col-span-5"
        >
          <p className="text-sm text-slate-300">Phase 1 public mint opens on Friday, 20:00 UTC.</p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              ['03', 'Days'],
              ['14', 'Hours'],
              ['09', 'Mins'],
              ['42', 'Secs']
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center">
                <p className="font-display text-lg text-white">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Tasks Today" icon={<CheckCircle2 className="h-4 w-4" />} className="lg:col-span-4">
          <ul className="space-y-2">
            {taskItems.map((task) => (
              <li
                key={task.label}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <span className="text-sm text-slate-200">{task.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    task.done
                      ? 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                      : 'border border-amber-300/40 bg-amber-300/10 text-amber-200'
                  }`}
                >
                  {task.done ? 'Done' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard title="Activity Timeline" icon={<Clock3 className="h-4 w-4" />} className="lg:col-span-4">
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-white/15" />
            <ul className="space-y-4">
              {timelineItems.map((entry) => (
                <li key={entry.time + entry.title} className="relative">
                  <span className="absolute -left-5 top-1.5 h-3 w-3 rounded-full border border-cyan-300/50 bg-cyan-300/20" />
                  <p className="text-xs text-slate-400">{entry.time}</p>
                  <p className="text-sm text-white">{entry.title}</p>
                  <p className="text-xs text-slate-400">{entry.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </GlassCard>

        <GlassCard
          title="Analytics (Placeholder)"
          icon={<TrendingUp className="h-4 w-4" />}
          className="lg:col-span-8"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-300">Engagement trend</p>
              <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 text-xs text-cyan-200">
                +22.4%
              </span>
            </div>
            <div className="flex h-52 items-end gap-2">
              {chartBars.map((height, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${height}%`, opacity: 1 }}
                  transition={{ delay: 0.25 + index * 0.03, duration: 0.45 }}
                  className="flex-1 rounded-t-lg bg-gradient-to-t from-cyan-400/30 to-blue-400/70"
                />
              ))}
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </section>
  );
}
