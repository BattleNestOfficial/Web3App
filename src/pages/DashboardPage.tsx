import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ListTodo,
  RefreshCw,
  Wand2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchAlphaFeed, syncAlphaFeed, type AlphaFeedMeta, type AlphaTweet } from '../features/alphaFeed/api';
import {
  extractMintDetailsWithAi,
  fetchDailyProductivitySummaryWithAi,
  generateFarmingTasksWithAi,
  summarizeTweetsWithAi,
  type DailyProductivitySummaryResult,
  type FarmingTaskResult,
  type MintExtractionResult,
  type TweetSummaryResult
} from '../features/ai/api';
import {
  fetchUpcomingMarketplaceMints,
  type MarketplaceMintItem
} from '../features/marketplaceMints/api';
import { buildTrackedActivityEntries, type TrackedActivityEntry } from '../features/activity/stream';
import { mintDB } from '../features/mints/db';
import { todoDB, type TodoTaskRecord } from '../features/todo/db';
import { fetchWalletActivityEvents } from '../features/walletTracker/api';
import { Button } from '../components/ui/Button';

const defaultKeywords = ['mint', 'testnet', 'airdrop'];

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
  const [alphaTweets, setAlphaTweets] = useState<AlphaTweet[]>([]);
  const [alphaMeta, setAlphaMeta] = useState<AlphaFeedMeta | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(defaultKeywords);
  const [isFeedLoading, setIsFeedLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [aiSummary, setAiSummary] = useState<TweetSummaryResult | null>(null);
  const [aiTasks, setAiTasks] = useState<FarmingTaskResult | null>(null);
  const [aiMintByTweetId, setAiMintByTweetId] = useState<Record<string, MintExtractionResult>>({});
  const [dailyAiSummary, setDailyAiSummary] = useState<DailyProductivitySummaryResult | null>(null);
  const [dailySummaryError, setDailySummaryError] = useState('');
  const [isAiSummarizing, setIsAiSummarizing] = useState(false);
  const [isAiGeneratingTasks, setIsAiGeneratingTasks] = useState(false);
  const [isAiLoadingDailySummary, setIsAiLoadingDailySummary] = useState(false);
  const [extractingTweetId, setExtractingTweetId] = useState<string | null>(null);
  const [calendarItems, setCalendarItems] = useState<MarketplaceMintItem[]>([]);
  const [isCalendarLoading, setIsCalendarLoading] = useState(true);
  const [activityTimeline, setActivityTimeline] = useState<TrackedActivityEntry[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const todoTasks = useLiveQuery(async () => todoDB.tasks.toArray(), []);
  const mintRows = useLiveQuery(
    async () => (await mintDB.mints.toArray()).filter((mint) => mint.deletedAt === null),
    []
  );
  const localMints = useMemo(() => mintRows ?? [], [mintRows]);

  const accountFilterKey = useMemo(() => selectedAccounts.join('|'), [selectedAccounts]);
  const keywordFilterKey = useMemo(() => selectedKeywords.join('|'), [selectedKeywords]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsFeedLoading(true);
      setFeedError('');

      try {
        const response = await fetchAlphaFeed({
          accounts: selectedAccounts,
          keywords: selectedKeywords,
          limit: 24
        });

        if (!isMounted) return;
        setAlphaTweets(response.data);
        setAlphaMeta(response.meta);

        if (response.meta.sync?.warnings?.length) {
          setSyncMessage(response.meta.sync.warnings.join(' '));
        }
      } catch (error) {
        if (!isMounted) return;
        setFeedError(error instanceof Error ? error.message : 'Failed to load alpha feed.');
      } finally {
        if (isMounted) {
          setIsFeedLoading(false);
        }
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [accountFilterKey, keywordFilterKey, selectedAccounts, selectedKeywords]);

  useEffect(() => {
    let isMounted = true;

    async function loadDailySummary() {
      setIsAiLoadingDailySummary(true);
      setDailySummaryError('');
      try {
        const response = await fetchDailyProductivitySummaryWithAi();
        if (!isMounted) return;
        setDailyAiSummary(response);
      } catch (error) {
        if (!isMounted) return;
        setDailySummaryError(error instanceof Error ? error.message : 'Failed to load AI daily summary.');
      } finally {
        if (isMounted) {
          setIsAiLoadingDailySummary(false);
        }
      }
    }

    void loadDailySummary();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadActivityTimeline(showLoader: boolean) {
      if (showLoader) {
        setIsActivityLoading(true);
      }
      setActivityError('');
      try {
        const walletEvents = await fetchWalletActivityEvents({ limit: 160 });
        if (!isMounted) return;
        setActivityTimeline(buildTrackedActivityEntries(walletEvents, localMints, 12));
      } catch (error) {
        if (!isMounted) return;
        setActivityTimeline(buildTrackedActivityEntries([], localMints, 12));
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity timeline.');
      } finally {
        if (isMounted) {
          setIsActivityLoading(false);
        }
      }
    }

    void loadActivityTimeline(true);
    const timer = window.setInterval(() => {
      void loadActivityTimeline(false);
    }, 45_000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [localMints]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMintCalendar() {
      setIsCalendarLoading(true);

      try {
        const response = await fetchUpcomingMarketplaceMints({ days: 45, limit: 24 });
        if (!isMounted) return;
        setCalendarItems(response.data);
      } catch (error) {
        if (!isMounted) return;
        setCalendarItems([]);
      } finally {
        if (isMounted) {
          setIsCalendarLoading(false);
        }
      }
    }

    void loadMintCalendar();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSync() {
    setIsSyncing(true);
    setFeedError('');
    setSyncMessage('');

    try {
      const response = await syncAlphaFeed({
        accounts: selectedAccounts,
        keywords: selectedKeywords,
        limit: 24
      });
      setAlphaTweets(response.data);
      setAlphaMeta(response.meta);

      const sync = response.meta.sync;
      if (sync) {
        const parts = [`Fetched ${sync.fetchedCount}`, `Stored ${sync.storedCount}`];
        if (sync.warnings.length > 0) parts.push(sync.warnings.join(' '));
        if (sync.errors.length > 0) parts.push(sync.errors.join(' '));
        setSyncMessage(parts.join(' | '));
      }
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Failed to sync alpha feed.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleAiSummarizeTweets() {
    if (alphaTweets.length === 0) {
      setAiSummary({ summary: 'No tweets available for summarization.', highlights: [] });
      return;
    }

    setIsAiSummarizing(true);
    setFeedError('');
    try {
      const response = await summarizeTweetsWithAi(
        alphaTweets.map((tweet) => ({
          text: tweet.text,
          authorUsername: tweet.authorUsername
        }))
      );
      setAiSummary(response);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Failed to summarize tweets.');
    } finally {
      setIsAiSummarizing(false);
    }
  }

  async function handleAiGenerateFarmingTasks() {
    if (alphaTweets.length === 0) {
      setAiTasks({ tasks: [] });
      return;
    }

    setIsAiGeneratingTasks(true);
    setFeedError('');
    try {
      const response = await generateFarmingTasksWithAi(
        alphaTweets.map((tweet) => ({
          text: tweet.text,
          authorUsername: tweet.authorUsername
        }))
      );
      setAiTasks(response);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Failed to generate farming tasks.');
    } finally {
      setIsAiGeneratingTasks(false);
    }
  }

  async function handleAiExtractMint(tweet: AlphaTweet) {
    setExtractingTweetId(tweet.tweetId);
    setFeedError('');
    try {
      const response = await extractMintDetailsWithAi(tweet.text);
      setAiMintByTweetId((prev) => ({
        ...prev,
        [tweet.tweetId]: response
      }));
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'Failed to extract mint details.');
    } finally {
      setExtractingTweetId(null);
    }
  }

  function toggleKeyword(keyword: string) {
    setSelectedKeywords((prev) => {
      const normalized = keyword.toLowerCase();
      if (prev.some((item) => item.toLowerCase() === normalized)) {
        return prev.filter((item) => item.toLowerCase() !== normalized);
      }
      return [...prev, keyword];
    });
  }

  function toggleAccount(account: string) {
    setSelectedAccounts((prev) => {
      const normalized = account.toLowerCase();
      if (prev.some((item) => item.toLowerCase() === normalized)) {
        return prev.filter((item) => item.toLowerCase() !== normalized);
      }
      return [...prev, account];
    });
  }

  const configuredAccounts = alphaMeta?.configuredAccounts ?? [];
  const configuredKeywords = alphaMeta?.configuredKeywords?.length ? alphaMeta.configuredKeywords : defaultKeywords;
  const nextMarketplaceMint = calendarItems[0] ?? null;
  const tasksToday = useMemo(() => {
    const tasks = [...(todoTasks ?? [])];
    if (tasks.length === 0) return [];

    const now = new Date(nowTick);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1;

    const sortTasks = (rows: TodoTaskRecord[]) =>
      rows.sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return b.updatedAt - a.updatedAt;
      });

    const dueToday = sortTasks(tasks.filter((task) => task.dueAt !== null && task.dueAt >= dayStart && task.dueAt <= dayEnd));
    if (dueToday.length > 0) {
      return dueToday.slice(0, 6);
    }

    return sortTasks(tasks).slice(0, 6);
  }, [todoTasks, nowTick]);

  return (
    <section className="mx-auto max-w-7xl">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 170, damping: 24 }}
        className="mb-6"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
        <h2 className="text-gradient mt-1 font-display text-2xl sm:text-3xl">Welcome back, Operator</h2>
      </motion.header>

      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12">
        <GlassCard
          title="Upcoming Mint"
          icon={<CalendarClock className="h-4 w-4" />}
          className="lg:col-span-5"
        >
          {isCalendarLoading ? (
            <p className="text-sm text-slate-300">Loading upcoming mint feed...</p>
          ) : nextMarketplaceMint ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    nextMarketplaceMint.source === 'magiceden'
                      ? 'border-cyan-300/35 bg-cyan-300/10 text-cyan-200'
                      : 'border-emerald-300/35 bg-emerald-300/10 text-emerald-200'
                  }`}
                >
                  {nextMarketplaceMint.sourceLabel}
                </span>
                <p className="text-sm text-slate-200">{nextMarketplaceMint.name}</p>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Starts {new Date(nextMarketplaceMint.startsAt).toLocaleString()} ({nextMarketplaceMint.chain})
              </p>
              <p className="mt-2 text-xs text-glow">{formatTimeUntil(nextMarketplaceMint.startsAt, nowTick)}</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {formatCountdownParts(nextMarketplaceMint.startsAt, nowTick).map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center">
                    <p className="font-display text-lg text-white">{value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-300">No upcoming mint data available yet.</p>
          )}
        </GlassCard>

        <GlassCard title="Tasks Today" icon={<CheckCircle2 className="h-4 w-4" />} className="lg:col-span-4">
          {tasksToday.length === 0 ? (
            <p className="text-sm text-slate-300">No to-do tasks yet. Add tasks in the To-Do module.</p>
          ) : (
            <ul className="space-y-2">
              {tasksToday.map((task) => {
                const overdue = !task.done && task.dueAt !== null && task.dueAt < nowTick;
                const badge = task.done
                  ? 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                  : overdue
                    ? 'border border-rose-300/40 bg-rose-300/10 text-rose-200'
                    : 'border border-amber-300/40 bg-amber-300/10 text-amber-200';
                const label = task.done ? 'Done' : overdue ? 'Overdue' : 'Pending';

                return (
                  <li
                    key={task.id ?? `${task.title}-${task.updatedAt}`}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <span className={`text-sm ${task.done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>{task.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${badge}`}>{label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

        <GlassCard title="Activity Timeline" icon={<Clock3 className="h-4 w-4" />} className="lg:col-span-4">
          {isActivityLoading ? (
            <p className="text-sm text-slate-300">Loading wallet and whitelist activity...</p>
          ) : (
            <div className="relative pl-5">
              <div className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-white/15" />
              {activityTimeline.length === 0 ? (
                <p className="text-sm text-slate-300">No activity captured yet.</p>
              ) : (
                <ul className="space-y-4">
                  {activityTimeline.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span
                        className={`absolute -left-5 top-1.5 h-3 w-3 rounded-full border ${timelineDotClass(entry.kind)}`}
                      />
                      <p className="text-xs text-slate-400">{formatTimelineTime(entry.happenedAt)}</p>
                      <p className="text-sm text-white">{entry.title}</p>
                      <p className="text-xs text-slate-400">{entry.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
              {activityError ? <p className="mt-3 text-xs text-amber-200">{activityError}</p> : null}
            </div>
          )}
        </GlassCard>

        <GlassCard title="AI Daily Productivity Summary" icon={<Brain className="h-4 w-4" />} className="lg:col-span-4">
          {isAiLoadingDailySummary ? (
            <p className="text-sm text-slate-300">Generating daily summary...</p>
          ) : dailySummaryError ? (
            <div className="rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
              {dailySummaryError}
            </div>
          ) : dailyAiSummary ? (
            <div>
              <p className="text-sm text-slate-200">{dailyAiSummary.summary}</p>
              <p className="mt-2 text-xs text-slate-400">
                Source: {dailyAiSummary.source.toUpperCase()} | Generated:{' '}
                {new Date(dailyAiSummary.generatedAt).toLocaleString()}
              </p>

              {dailyAiSummary.focusItems.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Focus</p>
                  <ul className="space-y-1">
                    {dailyAiSummary.focusItems.map((itemText, index) => (
                      <li key={`focus-${index}`} className="text-xs text-slate-300">
                        - {itemText}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {dailyAiSummary.riskItems.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Risks</p>
                  <ul className="space-y-1">
                    {dailyAiSummary.riskItems.map((itemText, index) => (
                      <li key={`risk-${index}`} className="text-xs text-slate-300">
                        - {itemText}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-300">Summary unavailable.</p>
          )}
        </GlassCard>

        <GlassCard title="Alpha Feed" icon={<Clock3 className="h-4 w-4" />} className="lg:col-span-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Accounts</span>
              <button
                type="button"
                onClick={() => setSelectedAccounts([])}
                className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                  selectedAccounts.length === 0
                    ? 'border-glow/60 bg-glow/10 text-white'
                    : 'border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                All configured
              </button>
              {configuredAccounts.map((account) => {
                const active = selectedAccounts.some((item) => item.toLowerCase() === account.toLowerCase());
                return (
                  <button
                    key={account}
                    type="button"
                    onClick={() => toggleAccount(account)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                      active
                        ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
                        : 'border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    @{account}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                onClick={() => void handleAiSummarizeTweets()}
                disabled={isAiSummarizing}
              >
                <Wand2 className={`mr-2 h-4 w-4 ${isAiSummarizing ? 'animate-pulse' : ''}`} />
                {isAiSummarizing ? 'Summarizing...' : 'Summarize'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="px-3"
                onClick={() => void handleAiGenerateFarmingTasks()}
                disabled={isAiGeneratingTasks}
              >
                <ListTodo className={`mr-2 h-4 w-4 ${isAiGeneratingTasks ? 'animate-pulse' : ''}`} />
                {isAiGeneratingTasks ? 'Generating...' : 'Generate Tasks'}
              </Button>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void handleSync()} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync now'}
              </Button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Keywords</span>
            {configuredKeywords.map((keyword) => {
              const active = selectedKeywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
              return (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => toggleKeyword(keyword)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                    active
                      ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                      : 'border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {keyword}
                </button>
              );
            })}
          </div>

          {aiSummary ? (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">AI Tweet Summary</p>
              <p className="text-sm text-slate-200">{aiSummary.summary}</p>
              {aiSummary.highlights.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {aiSummary.highlights.map((highlight, index) => (
                    <li key={`highlight-${index}`} className="text-xs text-slate-300">
                      - {highlight}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {aiTasks && aiTasks.tasks.length > 0 ? (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">AI Farming Tasks</p>
              <ul className="space-y-1.5">
                {aiTasks.tasks.map((task, index) => (
                  <li key={`ai-task-${index}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-white">{task.title}</span>
                      <span className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{task.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {syncMessage ? <p className="mb-2 text-xs text-cyan-200">{syncMessage}</p> : null}
          {alphaMeta?.lastFetchedAt ? (
            <p className="mb-2 text-xs text-slate-400">
              Last fetched: {new Date(alphaMeta.lastFetchedAt).toLocaleString()} | Stored tweets: {alphaMeta.totalCount}
            </p>
          ) : null}

          {feedError ? (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
              <AlertTriangle className="h-4 w-4" />
              {feedError}
            </div>
          ) : null}

          {isFeedLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-5 text-sm text-slate-300">Loading alpha feed...</div>
          ) : alphaTweets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 px-3 py-5 text-sm text-slate-300">
              No matching tweets found for current filters.
            </div>
          ) : (
            <div className="space-y-2">
              {alphaTweets.map((tweet, index) => (
                <motion.article
                  key={tweet.tweetId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: index * 0.02 }}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">@{tweet.authorUsername}</p>
                    <p className="text-xs text-slate-400">{new Date(tweet.tweetedAt).toLocaleString()}</p>
                  </div>
                  <p className="mb-2 whitespace-pre-wrap break-words text-sm text-slate-200">{tweet.text}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tweet.matchedKeywords.map((keyword) => (
                      <span
                        key={`${tweet.tweetId}-${keyword}`}
                        className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200"
                      >
                        {keyword}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => void handleAiExtractMint(tweet)}
                      className="inline-flex items-center rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-1 text-xs text-emerald-200 transition hover:border-emerald-300/55"
                      disabled={extractingTweetId === tweet.tweetId}
                    >
                      {extractingTweetId === tweet.tweetId ? 'Extracting...' : 'Extract Mint'}
                    </button>
                    <a
                      href={tweet.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center rounded-lg border border-slate-600 bg-panelAlt px-2.5 py-1 text-xs text-slate-100 transition hover:border-slate-500"
                    >
                      Open
                      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                    </a>
                  </div>
                  {aiMintByTweetId[tweet.tweetId] ? (
                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs text-slate-300">
                      <p>
                        Project: <span className="text-white">{aiMintByTweetId[tweet.tweetId].projectName ?? 'Unknown'}</span>
                      </p>
                      <p>
                        Chain: <span className="text-white">{aiMintByTweetId[tweet.tweetId].chain}</span>
                      </p>
                      <p>
                        Mint Type: <span className="text-white">{aiMintByTweetId[tweet.tweetId].mintType}</span>
                      </p>
                      <p>
                        Mint Date:{' '}
                        <span className="text-white">{aiMintByTweetId[tweet.tweetId].mintDate ?? 'Not detected'}</span>
                      </p>
                      <p>
                        Confidence:{' '}
                        <span className="text-white">{Math.round(aiMintByTweetId[tweet.tweetId].confidence * 100)}%</span>
                      </p>
                    </div>
                  ) : null}
                </motion.article>
              ))}
            </div>
          )}
        </GlassCard>
      </motion.div>
    </section>
  );
}

function formatTimeUntil(isoString: string, nowMs: number) {
  const targetMs = new Date(isoString).getTime();
  if (!Number.isFinite(targetMs)) return 'Unknown time';

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return 'Live or started';

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Starts in ${days}d ${hours}h`;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}

function timelineDotClass(kind: TrackedActivityEntry['kind']) {
  if (kind === 'minted_nft') return 'border-emerald-300/50 bg-emerald-300/20';
  if (kind === 'sold_nft') return 'border-rose-300/50 bg-rose-300/20';
  return 'border-cyan-300/50 bg-cyan-300/20';
}

function formatTimelineTime(timestamp: number) {
  const value = new Date(timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${value} IST`;
}

function formatCountdownParts(isoString: string, nowMs: number) {
  const targetMs = new Date(isoString).getTime();
  if (!Number.isFinite(targetMs)) {
    return [
      ['00', 'Days'],
      ['00', 'Hours'],
      ['00', 'Mins'],
      ['00', 'Secs']
    ] as const;
  }

  const diffMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    [String(days).padStart(2, '0'), 'Days'],
    [String(hours).padStart(2, '0'), 'Hours'],
    [String(minutes).padStart(2, '0'), 'Mins'],
    [String(seconds).padStart(2, '0'), 'Secs']
  ] as const;
}
