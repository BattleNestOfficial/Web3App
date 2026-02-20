import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  type MintDraft,
  type MintRecord,
  type ReminderOffsetMinutes,
  REMINDER_OPTIONS,
  type MintSyncStatus,
  type MintVisibility,
  createMint,
  mintDB,
  removeMint,
  updateMint
} from '../features/mints/db';
import { syncNotificationEnginePlaceholder } from '../features/mints/notificationEngine';
import { syncMintsWithBackend } from '../features/mints/sync';
import { formatCountdown, formatMintDate, parseDateInput, toIstDateInputValue } from '../features/mints/time';
import { useNow } from '../features/mints/useNow';

type FormState = {
  name: string;
  chain: string;
  mintDate: string;
  visibility: MintVisibility;
  link: string;
  notes: string;
  reminderOffsets: ReminderOffsetMinutes[];
};

const defaultFormState: FormState = {
  name: '',
  chain: '',
  mintDate: '',
  visibility: 'whitelist',
  link: '',
  notes: '',
  reminderOffsets: REMINDER_OPTIONS.map((option) => option.minutes)
};

export function MintTrackerPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Waiting for first sync...');
  const [errorText, setErrorText] = useState('');
  const now = useNow(1000);

  const mints = useLiveQuery(
    async () =>
      (await mintDB.mints.toArray())
        .filter((mint) => mint.deletedAt === null)
        .sort((a, b) => a.mintAt - b.mintAt),
    []
  );
  const reminders = useLiveQuery(async () => mintDB.reminders.orderBy('remindAt').toArray(), []);
  const sortedMints = useMemo(() => mints ?? [], [mints]);
  const allReminders = useMemo(() => reminders ?? [], [reminders]);
  const pendingSyncCount = useMemo(
    () => sortedMints.filter((mint) => mint.syncStatus !== 'synced').length,
    [sortedMints]
  );

  const mintNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const mint of sortedMints) {
      if (mint.id) {
        map.set(mint.id, mint.name);
      }
    }
    return map;
  }, [sortedMints]);

  const reminderOffsetsByMintId = useMemo(() => {
    const map = new Map<number, ReminderOffsetMinutes[]>();
    for (const reminder of allReminders) {
      const existing = map.get(reminder.mintId) ?? [];
      if (!existing.includes(reminder.offsetMinutes)) {
        existing.push(reminder.offsetMinutes);
      }
      map.set(reminder.mintId, existing);
    }

    for (const [mintId, offsets] of map) {
      map.set(
        mintId,
        offsets.sort((a, b) => b - a)
      );
    }
    return map;
  }, [allReminders]);

  const upcomingReminders = useMemo(() => {
    return allReminders
      .filter((reminder) => reminder.remindAt >= now)
      .sort((a, b) => a.remindAt - b.remindAt)
      .slice(0, 8)
      .map((reminder) => ({
        reminderId: reminder.id ?? -1,
        mintId: reminder.mintId,
        mintName: mintNameById.get(reminder.mintId) ?? 'Unknown Mint',
        remindAt: reminder.remindAt,
        offsetMinutes: reminder.offsetMinutes
      }));
  }, [allReminders, mintNameById, now]);

  const runSync = useCallback(async () => {
    setIsSyncing(true);
    const result = await syncMintsWithBackend();
    setSyncMessage(result.message);
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    const candidates = upcomingReminders.filter((entry) => entry.reminderId > 0);
    syncNotificationEnginePlaceholder(candidates);
  }, [upcomingReminders]);

  useEffect(() => {
    void runSync();
    const onOnline = () => {
      void runSync();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [runSync]);

  function toggleReminderOffset(minutes: ReminderOffsetMinutes) {
    setForm((prev) => {
      const exists = prev.reminderOffsets.includes(minutes);
      if (exists) {
        return {
          ...prev,
          reminderOffsets: prev.reminderOffsets.filter((value) => value !== minutes)
        };
      }
      return {
        ...prev,
        reminderOffsets: [...prev.reminderOffsets, minutes].sort((a, b) => b - a)
      };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorText('');
    setIsSubmitting(true);

    try {
      const mintAt = parseDateInput(form.mintDate);

      if (form.link && !/^https?:\/\//i.test(form.link.trim())) {
        throw new Error('Mint link must start with http:// or https://');
      }

      const draft: MintDraft = {
        name: form.name.trim(),
        chain: form.chain.trim(),
        mintAt,
        visibility: form.visibility,
        link: form.link.trim(),
        notes: form.notes.trim(),
        reminderOffsets: Array.from(new Set(form.reminderOffsets)).sort((a, b) => b - a)
      };

      if (!draft.name || !draft.chain) {
        throw new Error('Name and chain are required.');
      }

      if (editingId === null) {
        await createMint(draft);
      } else {
        await updateMint(editingId, draft);
      }

      void runSync();

      setForm(defaultFormState);
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save mint right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startEdit(mint: MintRecord) {
    if (!mint.id) return;
    const mintReminders = await mintDB.reminders.where('mintId').equals(mint.id).toArray();
    const reminderOffsets = Array.from(new Set(mintReminders.map((reminder) => reminder.offsetMinutes))).sort(
      (a, b) => b - a
    );

    setEditingId(mint.id);
    setErrorText('');
    setForm({
      name: mint.name,
      chain: mint.chain,
      mintDate: toIstDateInputValue(mint.mintAt),
      visibility: mint.visibility,
      link: mint.link,
      notes: mint.notes,
      reminderOffsets
    });
  }

  async function handleDelete(id?: number) {
    if (!id) return;
    if (!window.confirm('Delete this mint entry?')) return;
    await removeMint(id);
    void runSync();
    if (editingId === id) {
      setEditingId(null);
      setForm(defaultFormState);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">NFT Mints</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">NFT Mint Tracker</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr]">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2">
            <Plus className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit Mint' : 'Add Mint'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Mint name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Input
              placeholder="Chain (Ethereum, Solana, Base...)"
              value={form.chain}
              onChange={(event) => setForm((prev) => ({ ...prev, chain: event.target.value }))}
              required
            />
            <Input
              type="text"
              placeholder="Mint date/time (ex: 2026-03-01 6:00 PM EST or 2026-03-01 23:30 GMT)"
              value={form.mintDate}
              onChange={(event) => setForm((prev) => ({ ...prev, mintDate: event.target.value }))}
              required
            />
            <p className="text-xs text-slate-400">
              Time is shown in IST. If no timezone is provided, input is treated as IST.
            </p>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-panelAlt p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  form.visibility === 'whitelist'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                onClick={() => setForm((prev) => ({ ...prev, visibility: 'whitelist' }))}
              >
                WL
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  form.visibility === 'public' ? 'bg-slate-100 text-slate-900' : 'text-slate-300 hover:text-white'
                }`}
                onClick={() => setForm((prev) => ({ ...prev, visibility: 'public' }))}
              >
                Public
              </button>
            </div>

            <Input
              type="url"
              placeholder="Mint link (https://...)"
              value={form.link}
              onChange={(event) => setForm((prev) => ({ ...prev, link: event.target.value }))}
            />

            <div className="space-y-2 rounded-xl border border-slate-700 bg-panelAlt p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Reminders</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {REMINDER_OPTIONS.map((option) => {
                  const active = form.reminderOffsets.includes(option.minutes);
                  return (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => toggleReminderOffset(option.minutes)}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                        active
                          ? 'border-glow/60 bg-glow/15 text-white'
                          : 'border-slate-700 bg-panel text-slate-300 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
            />

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Mint' : 'Add Mint'}
              </Button>
              {editingId !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(defaultFormState);
                    setErrorText('');
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </motion.form>

        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-300">
                Total mints: <span className="font-semibold text-white">{sortedMints.length}</span>
              </p>
              <p className="text-sm text-slate-300">
                Pending sync: <span className="font-semibold text-white">{pendingSyncCount}</span>
              </p>
              <p className="text-sm text-slate-300">
                Upcoming reminders: <span className="font-semibold text-white">{upcomingReminders.length}</span>
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">{syncMessage}</p>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void runSync()} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync now
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-slate-400">Upcoming Reminders</p>
            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-slate-300">No reminders queued.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingReminders.map((reminder) => (
                  <li
                    key={`${reminder.reminderId}-${reminder.mintId}-${reminder.remindAt}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-white">{reminder.mintName}</p>
                      <p className="text-xs text-slate-400">
                        {formatOffsetLabel(reminder.offsetMinutes)} before mint
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{formatMintDate(reminder.remindAt)}</p>
                      <p className="text-sm font-semibold text-glow">{formatCountdown(reminder.remindAt, now)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {sortedMints.length === 0 ? (
              <motion.article
                key="empty-mint-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-3xl border border-dashed border-slate-700/80 bg-panel/60 p-6 text-center"
              >
                <p className="text-sm text-slate-300">No mint entries yet. Add one from the form.</p>
              </motion.article>
            ) : (
              sortedMints.map((mint, index) => (
                <MintCard
                  key={mint.id ?? `${mint.name}-${mint.mintAt}-${index}`}
                  mint={mint}
                  now={now}
                  index={index}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  syncStatus={mint.syncStatus}
                  reminderOffsets={mint.id ? reminderOffsetsByMintId.get(mint.id) ?? [] : []}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

type MintCardProps = {
  mint: MintRecord;
  now: number;
  index: number;
  onEdit: (mint: MintRecord) => Promise<void>;
  onDelete: (id?: number) => Promise<void>;
  syncStatus: MintSyncStatus;
  reminderOffsets: ReminderOffsetMinutes[];
};

function MintCard({ mint, now, index, onEdit, onDelete, syncStatus, reminderOffsets }: MintCardProps) {
  const isLive = mint.mintAt <= now;
  const countdown = formatCountdown(mint.mintAt, now);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_22px_45px_rgba(0,0,0,0.4)] backdrop-blur-xl"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-white">{mint.name}</h3>
          <p className="text-sm text-slate-300">{mint.chain}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs uppercase tracking-wide ${
            mint.visibility === 'whitelist'
              ? 'border border-indigo-300/40 bg-indigo-300/10 text-indigo-200'
              : 'border border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
          }`}
        >
          {mint.visibility === 'whitelist' ? 'Whitelist' : 'Public'}
        </span>
      </div>

      {syncStatus !== 'synced' ? (
        <div className="mb-3 inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-amber-200">
          {formatSyncStatus(syncStatus)}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Mint Date</p>
          <p className="mt-1 text-sm text-white">{formatMintDate(mint.mintAt)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Countdown</p>
          <p className={`mt-1 text-sm font-semibold ${isLive ? 'text-emerald-300' : 'text-glow'}`}>{countdown}</p>
        </div>
      </div>

      {mint.notes ? <p className="mt-3 text-sm text-slate-300">{mint.notes}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3" onClick={() => void onEdit(mint)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button type="button" variant="ghost" className="px-3" onClick={() => onDelete(mint.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {reminderOffsets.length === 0 ? (
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
              No reminders
            </span>
          ) : (
            reminderOffsets.map((offset) => (
              <span
                key={`${mint.id}-offset-${offset}`}
                className="rounded-full border border-glow/50 bg-glow/10 px-2 py-1 text-[10px] uppercase tracking-wide text-glow"
              >
                {formatOffsetLabel(offset)}
              </span>
            ))
          )}
        </div>

        {mint.link ? (
          <a
            href={mint.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl border border-slate-600 bg-panelAlt px-3 py-2 text-sm text-slate-100 transition hover:border-slate-500"
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Open Link
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </motion.article>
  );
}

function formatOffsetLabel(minutes: ReminderOffsetMinutes) {
  if (minutes === 60) return '1h';
  if (minutes === 30) return '30m';
  return '10m';
}

function formatSyncStatus(status: MintSyncStatus) {
  if (status === 'pending_create') return 'Pending create';
  if (status === 'pending_update') return 'Pending update';
  if (status === 'pending_delete') return 'Pending delete';
  return 'Sync error';
}
