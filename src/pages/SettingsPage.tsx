export function SettingsPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">App Configuration</h2>
      </header>

      <article className="rounded-2xl border border-slate-700/70 bg-panel p-6">
        <h3 className="font-display text-lg text-white">Production Checklist</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          <li>Keep layout components in `src/components/layout`.</li>
          <li>Add future business features in `src/features`.</li>
          <li>Replace PWA icons in `public/` before release.</li>
          <li>Run `npm run build` as a final verification step.</li>
        </ul>
      </article>
    </section>
  );
}

