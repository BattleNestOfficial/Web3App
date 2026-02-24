import { AnimatePresence, motion } from 'framer-motion';
import { AtSign, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  createTwitterTracker,
  deleteTwitterTracker,
  fetchTwitterMessages,
  fetchTwitterTrackers,
  syncTwitterTrackers,
  updateTwitterTracker,
  type TwitterMessage,
  type TwitterTracker
} from '../features/twitterTracker/api';

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const AUTO_SYNC_INTERVAL_MS = 45 * 1000;
const MAX_NOTIFICATIONS_PER_BATCH = 3;

type FormState = {
  handle: string;
  displayLabel: string;
};

const defaultForm: FormState = {
  handle: '',
  displayLabel: ''
};

export function TwitterTrackerPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [trackers, setTrackers] = useState<TwitterTracker[]>([]);
  const [messages, setMessages] = useState<TwitterMessage[]>([]);
  const [selectedTrackerId, setSelectedTrackerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<number | null>(null);
  const [autoSyncMessage, setAutoSyncMessage] = useState('');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  );
  const [isMutatingTrackerId, setIsMutatingTrackerId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState('');
  const seenTweetKeysRef = useRef(new Set<string>());
  const hasInitializedMessagesRef = useRef(false);
  const autoSyncRunRef = useRef(false);

  const selectedTracker = useMemo(
    () => trackers.find((tracker) => tracker.id === selectedTrackerId) ?? null,
    [selectedTrackerId, trackers]
  );

  const loadData = useCallback(async (options?: { preserveSelection?: boolean; withLoader?: boolean }) => {
    const preserveSelection = options?.preserveSelection ?? true;
    const withLoader = options?.withLoader ?? true;
    if (withLoader) setLoading(true);
    setErrorText('');

    try {
      const [nextTrackers, nextMessages] = await Promise.all([fetchTwitterTrackers(), fetchTwitterMessages({ limit: 120 })]);
      setTrackers(nextTrackers);
      setMessages(nextMessages);
      setSelectedTrackerId((currentSelectedId) => {
        if (!preserveSelection) {
          return nextTrackers[0]?.id ?? null;
        }
        if (currentSelectedId !== null && nextTrackers.some((tracker) => tracker.id === currentSelectedId)) {
          return currentSelectedId;
        }
        return nextTrackers[0]?.id ?? null;
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to load Twitter tracker data.');
    } finally {
      if (withLoader) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNotificationPermission(typeof Notification === 'undefined' ? 'denied' : Notification.permission);
    void loadData({ preserveSelection: false, withLoader: true });
  }, [loadData]);

  const runAutoSyncCycle = useCallback(async () => {
    if (autoSyncRunRef.current) return;
    autoSyncRunRef.current = true;
    setIsAutoSyncing(true);
    setAutoSyncMessage('');

    try {
      await syncTwitterTrackers();
      await loadData({ preserveSelection: true, withLoader: false });
      setLastAutoSyncAt(Date.now());
    } catch (error) {
      setAutoSyncMessage(error instanceof Error ? error.message : 'Auto-sync failed.');
    } finally {
      setIsAutoSyncing(false);
      autoSyncRunRef.current = false;
    }
  }, [loadData]);

  useEffect(() => {
    if (!autoSyncEnabled || trackers.length === 0) return;

    void runAutoSyncCycle();
    const timer = window.setInterval(() => {
      void runAutoSyncCycle();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [autoSyncEnabled, runAutoSyncCycle, trackers.length]);

  useEffect(() => {
    const currentKeys = new Set(messages.map((message) => `${message.tracker_id}:${message.tweet_id}`));

    if (!hasInitializedMessagesRef.current) {
      seenTweetKeysRef.current = currentKeys;
      hasInitializedMessagesRef.current = true;
      return;
    }

    const newMessages = messages.filter((message) => !seenTweetKeysRef.current.has(`${message.tracker_id}:${message.tweet_id}`));
    seenTweetKeysRef.current = currentKeys;

    if (newMessages.length === 0) return;

    const mostRecentMessage = newMessages
      .slice()
      .sort((a, b) => new Date(b.tweeted_at).getTime() - new Date(a.tweeted_at).getTime())[0];
    if (mostRecentMessage) {
      setAutoSyncMessage(
        `${newMessages.length} new tweet${newMessages.length === 1 ? '' : 's'} detected from tracked handles.`
      );
    }

    if (notificationPermission !== 'granted' || typeof Notification === 'undefined') return;

    newMessages.slice(0, MAX_NOTIFICATIONS_PER_BATCH).forEach((message) => {
      const body = message.tweet_text.length > 140 ? `${message.tweet_text.slice(0, 140)}...` : message.tweet_text;
      new Notification(`@${message.author_handle} posted`, {
        body,
        tag: `tweet-${message.tracker_id}-${message.tweet_id}`
      });
    });
  }, [messages, notificationPermission]);

  async function enableBrowserAlerts() {
    if (typeof Notification === 'undefined') {
      setAutoSyncMessage('Browser notifications are not supported in this environment.');
      setNotificationPermission('denied');
      return;
    }
    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      setAutoSyncMessage('Browser alerts are already enabled.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setAutoSyncMessage('Browser alerts enabled for new tweets.');
    } else {
      setAutoSyncMessage('Browser alerts are blocked. Enable notifications in browser settings.');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrorText('');

    try {
      const created = await createTwitterTracker({
        handle: form.handle.trim(),
        displayLabel: form.displayLabel.trim(),
        enabled: true
      });
      setForm(defaultForm);
      setSelectedTrackerId(created.id);
      await loadData({ preserveSelection: true, withLoader: false });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to create Twitter tracker.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tracker: TwitterTracker) {
    if (!window.confirm(`Delete tracker @${tracker.handle}?`)) return;
    setIsMutatingTrackerId(tracker.id);
    setErrorText('');

    try {
      await deleteTwitterTracker(tracker.id);
      await loadData({ preserveSelection: true, withLoader: false });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to delete Twitter tracker.');
    } finally {
      setIsMutatingTrackerId(null);
    }
  }

  async function handleToggleTracker(tracker: TwitterTracker) {
    setIsMutatingTrackerId(tracker.id);
    setErrorText('');

    try {
      await updateTwitterTracker(tracker.id, { enabled: !tracker.enabled });
      await loadData({ preserveSelection: true, withLoader: false });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to update Twitter tracker.');
    } finally {
      setIsMutatingTrackerId(null);
    }
  }

  async function handleSync(trackerId?: number) {
    setIsSyncing(true);
    setErrorText('');

    try {
      await syncTwitterTrackers(trackerId);
      await loadData({ preserveSelection: true, withLoader: false });
      setLastAutoSyncAt(Date.now());
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to sync tweets.');
    } finally {
      setIsSyncing(false);
    }
  }

  const filteredMessages = useMemo(() => {
    const now = Date.now();
    const recentCutoff = now - RECENT_WINDOW_MS;
    const scoped = selectedTracker ? messages.filter((message) => message.tracker_id === selectedTracker.id) : messages;
    return scoped
      .filter((message) => {
        const tweetedAt = new Date(message.tweeted_at).getTime();
        return Number.isFinite(tweetedAt) && tweetedAt >= recentCutoff;
      })
      .sort((a, b) => new Date(b.tweeted_at).getTime() - new Date(a.tweeted_at).getTime());
  }, [messages, selectedTracker]);

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Social Monitoring</p>
        <h2 className="text-gradient mt-1 font-display text-2xl sm:text-3xl">Twitter Tracker</h2>
        <p className="mt-2 text-sm text-slate-400">
          Tracks only new posts after you add a handle. Panel shows recent items (last 48 hours).
        </p>
        <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
          <p>
            Auto-sync: {autoSyncEnabled ? 'ON' : 'OFF'} (every {Math.floor(AUTO_SYNC_INTERVAL_MS / 1000)}s)
            {isAutoSyncing ? ' | Syncing now...' : ''}
            {lastAutoSyncAt ? ` | Last sync: ${new Date(lastAutoSyncAt).toLocaleString()}` : ''}
          </p>
          {autoSyncMessage ? <p className="mt-1 text-cyan-200">{autoSyncMessage}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={autoSyncEnabled ? 'secondary' : 'ghost'}
              className="h-8 px-2.5 text-xs"
              onClick={() => setAutoSyncEnabled((prev) => !prev)}
            >
              {autoSyncEnabled ? 'Pause Auto-Sync' : 'Enable Auto-Sync'}
            </Button>
            <Button
              type="button"
              variant={notificationPermission === 'granted' ? 'secondary' : 'ghost'}
              className="h-8 px-2.5 text-xs"
              onClick={() => void enableBrowserAlerts()}
            >
              Alerts: {notificationPermission}
            </Button>
          </div>
        </div>
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
            <h3 className="font-display text-lg text-white">Add Twitter Handle</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="@handle"
              value={form.handle}
              onChange={(event) => setForm((prev) => ({ ...prev, handle: event.target.value }))}
              required
            />
            <Input
              placeholder="Label (optional)"
              value={form.displayLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, displayLabel: event.target.value }))}
            />

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Track Handle'}
              </Button>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void handleSync(selectedTrackerId ?? undefined)} disabled={isSyncing}>
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
                Tracked handles: <span className="font-semibold text-white">{trackers.length}</span>
              </p>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void handleSync()} disabled={isSyncing}>
                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sync all
              </Button>
            </div>

            {loading ? (
              <p className="text-sm text-slate-300">Loading trackers...</p>
            ) : trackers.length === 0 ? (
              <p className="text-sm text-slate-300">No Twitter handles tracked yet.</p>
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
                        <p className="truncate text-sm font-medium text-white">{tracker.display_label || `@${tracker.handle}`}</p>
                        <p className="truncate text-xs text-slate-400">@{tracker.handle}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {tracker.message_count ?? 0} message(s) | last check{' '}
                          {tracker.last_checked_at ? new Date(tracker.last_checked_at).toLocaleString() : 'never'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide transition ${
                            tracker.enabled
                              ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/20'
                              : 'border-slate-500/50 bg-slate-500/10 text-slate-200 hover:bg-slate-500/20'
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleToggleTracker(tracker);
                          }}
                          disabled={isMutatingTrackerId === tracker.id}
                        >
                          {isMutatingTrackerId === tracker.id ? '...' : tracker.enabled ? 'Enabled' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:border-rose-400/40 hover:text-rose-300"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDelete(tracker);
                          }}
                          aria-label="Delete tracker"
                          disabled={isMutatingTrackerId === tracker.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <AtSign className="h-4 w-4 text-glow" />
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                {selectedTracker ? `Recent Tweets (${selectedTracker.display_label || `@${selectedTracker.handle}`})` : 'Recent Tweets'}
              </p>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredMessages.length === 0 ? (
                <motion.article
                  key="empty-twitter-events"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No recent tweets captured yet.</p>
                </motion.article>
              ) : (
                filteredMessages.slice(0, 100).map((message, index) => (
                  <motion.article
                    key={`${message.id}-${message.tweet_id}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, delay: index * 0.01 }}
                    className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{message.display_label || `@${message.handle}`}</p>
                        <p className="truncate text-xs text-slate-400">@{message.author_handle}</p>
                      </div>
                      <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                        New
                      </span>
                    </div>
                    <p className="text-sm text-slate-100">{message.tweet_text}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">{new Date(message.tweeted_at).toLocaleString()}</p>
                      {message.tweet_url ? (
                        <a
                          className="inline-flex items-center gap-1 text-xs text-cyan-200 transition hover:text-cyan-100"
                          href={message.tweet_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
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
