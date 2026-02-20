import { motion } from 'framer-motion';

const items = [
  { name: 'Website Shell', stage: 'Wireframe' },
  { name: 'Mobile Navigation', stage: 'UI Polish' },
  { name: 'PWA Manifest', stage: 'Production Ready' }
];

export function ProjectsPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Projects</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Workstreams</h2>
      </header>

      <div className="space-y-3">
        {items.map((item, index) => (
          <motion.article
            key={item.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.06 }}
            className="rounded-2xl border border-slate-700/70 bg-panel p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{item.name}</p>
                <p className="text-sm text-slate-400">UI and routing baseline</p>
              </div>
              <span className="rounded-full border border-glow/50 bg-glow/10 px-3 py-1 text-xs text-glow">
                {item.stage}
              </span>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

