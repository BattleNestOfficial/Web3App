import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, Loader2, Plus, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  createWalletTracker,
  deleteWalletTracker,
  fetchWalletActivityEvents,
  fetchWalletTrackers,
  syncWalletTrackers,
  type WalletActivityEvent,
  type WalletTracker
} from '../features/walletTracker/api';

type FormState = {
  walletAddress: string;
  walletLabel: string;
  notifyBuy: boolean;
  notifySell: boolean;
  notifyMint: boolean;
};

const defaultForm: FormState = {
  walletAddress: '',
  walletLabel: '',
  notifyBuy: true,
  notifySell: true,
  notifyMint: true
};

export function WalletTrackerPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [trackers, setTrackers] = useState<WalletTracker[]>([]);
  const [events, setEvents] = useState<WalletActivityEvent[]>([]);
  const [selectedTrackerId, setSelectedTrackerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const selectedTracker = useMemo(
    () => trackers.find((tracker) => tracker.id === selectedTrackerId) ?? null,
    [selectedTrackerId, trackers]
  );

  async function loadData(options?: { preserveSelection?: boolean }) {
    const preserveSelection = options?.preserveSelection ?? true;
    setLoading(true);
    setErrorText('');

    try {
      const [nextTrackers, nextEvents] = await Promise.all([
        fetchWalletTrackers(),
        fetchWalletActivityEvents({ limit: 80 })
      ]);

      setTrackers(nextTrackers);
      setEvents(nextEvents);

      if (!preserveSelection) {
        setSelectedTrackerId(nextTrackers[0]?.id ?? null);
      } else if (
        selectedTrackerId !== null &&
        !nextTrackers.some((tracker) => tracker.id === selectedTrackerId)
      ) {
        setSelectedTrackerId(nextTrackers[0]?.id ?? null);
      } else if (selectedTrackerId === null) {
        setSelectedTrackerId(nextTrackers[0]?.id ?? null);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to load wallet tracker data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData({ preserveSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorText('');

    try {
      await createWalletTracker({
        walletAddress: form.walletAddress.trim(),
        walletLabel: form.walletLabel.trim(),
        notifyBuy: form.notifyBuy,
        notifySell: form.notifySell,
        notifyMint: form.notifyMint,
        enabled: true
      });

      setForm(defaultForm);
      await loadData();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to create wallet tracker.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tracker: WalletTracker) {
    if (!window.confirm(`Delete tracker ${tracker.wallet_label || tracker.wallet_address}?`)) return;

    try {
      await deleteWalletTracker(tracker.id);
      await loadData();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to delete tracker.');
    }
  }

  async function handleSync(trackerId?: number) {
    setIsSyncing(true);
    setErrorText('');

    try {
      await syncWalletTrackers(trackerId);
      await loadData();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to sync wallet events.');
    } finally {
      setIsSyncing(false);
    }
  }

  const filteredEvents = useMemo(() => {
    if (!selectedTracker) return events;
    return events.filter((event) => event.tracker_id === selectedTracker.id);
  }, [events, selectedTracker]);

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Wallet Activity</p>
        <h2 className="text-gradient mt-1 font-display text-2xl sm:text-3xl">Wallet Tracker</h2>
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
            <h3 className="font-display text-lg text-white">Add Wallet</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Wallet address (0x...)"
              value={form.walletAddress}
              onChange={(event) => setForm((prev) => ({ ...prev, walletAddress: event.target.value }))}
              required
            />
            <Input
              placeholder="Label (optional)"
              value={form.walletLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, walletLabel: event.target.value }))}
            />

            <div className="rounded-xl border border-slate-700 bg-panelAlt p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Notify on</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Toggle
                  label="Buy"
                  checked={form.notifyBuy}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifyBuy: checked }))}
                />
                <Toggle
                  label="Sell"
                  checked={form.notifySell}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifySell: checked }))}
                />
                <Toggle
                  label="Mint"
                  checked={form.notifyMint}
                  onChange={(checked) => setForm((prev) => ({ ...prev, notifyMint: checked }))}
                />
              </div>
            </div>

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Track Wallet'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                onClick={() => void handleSync(selectedTrackerId ?? undefined)}
                disabled={isSyncing}
              >
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync
              </Button>
            </div>
          </div>
        </motion.form>

        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-slate-300">
                Tracked wallets: <span className="font-semibold text-white">{trackers.length}</span>
              </p>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void handleSync()} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync all
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-slate-300">Loading trackers...</p>
            ) : trackers.length === 0 ? (
              <p className="text-sm text-slate-300">No wallets tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {trackers.map((tracker) => (
                  <button
                    key={tracker.id}
                    type="button"
                    onClick={() => setSelectedTrackerId(tracker.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      selectedTrackerId === tracker.id
                        ? 'border-glow/60 bg-glow/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {tracker.wallet_label || tracker.wallet_address}
                        </p>
                        <p className="truncate text-xs text-slate-400">{tracker.wallet_address}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {tracker.event_count ?? 0} event(s) | last check{' '}
                          {tracker.last_checked_at ? new Date(tracker.last_checked_at).toLocaleString() : 'never'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:border-rose-400/40 hover:text-rose-300"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(tracker);
                        }}
                        aria-label="Delete tracker"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tracker.notify_buy ? <Tag label="BUY" /> : null}
                      {tracker.notify_sell ? <Tag label="SELL" /> : null}
                      {tracker.notify_mint ? <Tag label="MINT" /> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <BellRing className="h-4 w-4 text-glow" />
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                {selectedTracker ? `Recent Activity (${selectedTracker.wallet_label || selectedTracker.wallet_address})` : 'Recent Activity'}
              </p>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredEvents.length === 0 ? (
                <motion.article
                  key="empty-wallet-events"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No wallet events captured yet.</p>
                </motion.article>
              ) : (
                filteredEvents.slice(0, 80).map((activity, index) => (
                  <motion.article
                    key={`${activity.id}-${activity.event_id}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, delay: index * 0.01 }}
                    className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-glow" />
                        <p className="text-sm text-white">{activity.wallet_label || activity.wallet_address}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${activityBadge(activity.event_type)}`}>
                        {activity.event_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {activity.collection_slug || 'Collection'} {activity.token_id ? `#${activity.token_id}` : ''}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(activity.event_at).toLocaleString()}
                      {activity.price_value ? ` | ${activity.price_value}${activity.currency_symbol ? ` ${activity.currency_symbol}` : ''}` : ''}
                    </p>
                    {activity.tx_hash ? <p className="mt-1 truncate text-[11px] text-slate-500">tx: {activity.tx_hash}</p> : null}
                  </motion.article>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-panel px-2.5 py-2 text-sm text-slate-100">
      <input type="checkbox" className="h-4 w-4 accent-red-500" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-full border border-red-300/30 bg-red-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-200">{label}</span>;
}

function activityBadge(eventType: WalletActivityEvent['event_type']) {
  if (eventType === 'buy') return 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
  if (eventType === 'sell') return 'border border-rose-300/40 bg-rose-300/10 text-rose-200';
  if (eventType === 'mint') return 'border border-red-300/40 bg-red-300/10 text-red-200';
  return 'border border-slate-400/30 bg-slate-400/10 text-slate-200';
}
