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
  Sparkles,
  TrendingUp,
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
import { Button } from '../components/ui/Button';

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
