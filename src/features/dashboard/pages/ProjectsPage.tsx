import { motion } from 'framer-motion';

const projects = [
  { name: 'Portal Core', stack: 'React + Firebase', status: 'Healthy' },
  { name: 'Ops Mobile', stack: 'PWA', status: 'Monitoring' },
  { name: 'Auth Gateway', stack: 'Cloud Functions', status: 'Healthy' }
];

export function ProjectsPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Projects</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Deployment Pipeline</h2>
      </header>

      <div className="space-y-3">
        {projects.map((project, idx) => (
          <motion.article
            key={project.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="rounded-2xl border border-slate-700/70 bg-panel px-5 py-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-white">{project.name}</p>
                <p className="text-sm text-slate-400">{project.stack}</p>
              </div>
              <span className="rounded-full border border-glow/50 bg-glow/10 px-3 py-1 text-xs text-glow">
                {project.status}
              </span>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

