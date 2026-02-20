export function SettingsPage() {
  return (
    <section className="mx-auto max-w-6xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Environment Configuration</h2>
      </header>

      <article className="rounded-2xl border border-slate-700/70 bg-panel p-6">
        <h3 className="font-display text-lg text-white">Firebase Setup Checklist</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          <li>Set all `VITE_FIREBASE_*` values in `.env`.</li>
          <li>Enable Email/Password and Google providers.</li>
          <li>Add deployment domain to Firebase authorized domains.</li>
          <li>Replace default PWA icons in `public/` before shipping.</li>
        </ul>
      </article>
    </section>
  );
}

