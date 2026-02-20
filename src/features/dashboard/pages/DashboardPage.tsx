import { motion } from 'framer-motion';

const cards = [
  { label: 'Active Sessions', value: '128', delta: '+12%' },
  { label: 'Deployments', value: '32', delta: '+4%' },
  { label: 'Auth Success Rate', value: '99.93%', delta: '+0.1%' },
  { label: 'PWA Installs', value: '864', delta: '+19%' }
];

export function DashboardPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Futuristic Auth Control Center</h2>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <motion.article
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
            className="rounded-2xl border border-slate-700/70 bg-panel p-5"
          >
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{card.value}</p>
            <p className="mt-3 text-xs text-glow">{card.delta} this week</p>
          </motion.article>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <article className="rounded-2xl border border-slate-700/70 bg-panel p-6">
          <h3 className="font-display text-lg text-white">System Insight</h3>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            This shell is already wired for Firebase identity and PWA install prompts. Connect your backend APIs to
            extend this into a full production workflow.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-700/70 bg-panel p-6">
          <h3 className="font-display text-lg text-white">Status</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li>Auth: Online</li>
            <li>PWA Cache: Active</li>
            <li>Animations: Enabled</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

