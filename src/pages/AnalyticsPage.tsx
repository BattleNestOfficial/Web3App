import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { BarChart3, CheckCircle2, Clock3, Droplets, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  buildTrackedActivityEntries,
  summarizeTrackedActivities,
  type TrackedActivityEntry
} from '../features/activity/stream';
import { fetchNftPortfolioAnalytics, type PortfolioAnalytics } from '../features/analytics/api';
import { farmingDB } from '../features/farming/db';
import { mintDB } from '../features/mints/db';
import { todoDB } from '../features/todo/db';
import { fetchWalletActivityEvents } from '../features/walletTracker/api';

type ChartPoint = {
  key: string;
  label: string;
  value: number;
  ratio: number;
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
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

function buildMonthKeys(windowSize: number, nowMs: number) {
  const now = new Date(nowMs);
  const output: string[] = [];
  for (let i = windowSize - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    output.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return output;
}

function monthLabel(key: string) {
  const [yearText, monthText] = key.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return key;
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'short'
  });
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function buildRecentDayKeys(windowSize: number, nowMs: number) {
  const output: string[] = [];
  for (let i = windowSize - 1; i >= 0; i -= 1) {
    const date = new Date(nowMs - i * 24 * 60 * 60 * 1000);
    output.push(dayKey(date.getTime()));
  }
  return output;
}

export function AnalyticsPage() {
  const nowMs = Date.now();
  const mintRows = useLiveQuery(
    async () => (await mintDB.mints.toArray()).filter((mint) => mint.deletedAt === null),
    []
  );
  const taskRows = useLiveQuery(async () => todoDB.tasks.toArray(), []);
  const farmingRows = useLiveQuery(
    async () => (await farmingDB.projects.toArray()).filter((project) => project.deletedAt === null),
    []
  );
  const [portfolio, setPortfolio] = useState<PortfolioAnalytics | null>(null);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState('');
  const [trackedActivities, setTrackedActivities] = useState<TrackedActivityEntry[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

  const mints = useMemo(() => mintRows ?? [], [mintRows]);
  const tasks = useMemo(() => taskRows ?? [], [taskRows]);
  const projects = useMemo(() => farmingRows ?? [], [farmingRows]);

  useEffect(() => {
    let isMounted = true;

    async function loadPortfolio() {
      setIsPortfolioLoading(true);
      setPortfolioError('');
      try {
        const response = await fetchNftPortfolioAnalytics({ holdingsLimit: 40 });
        if (!isMounted) return;
        setPortfolio(response);
      } catch (error) {
        if (!isMounted) return;
        setPortfolioError(error instanceof Error ? error.message : 'Failed to load NFT portfolio analytics.');
      } finally {
        if (isMounted) {
          setIsPortfolioLoading(false);
        }
      }
    }

    void loadPortfolio();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTrackedActivities(showLoader: boolean) {
      if (showLoader) {
        setIsActivityLoading(true);
      }
      setActivityError('');
      try {
        const walletEvents = await fetchWalletActivityEvents({ limit: 250 });
        if (!isMounted) return;
        setTrackedActivities(buildTrackedActivityEntries(walletEvents, mints, 120));
      } catch (error) {
        if (!isMounted) return;
        setTrackedActivities(buildTrackedActivityEntries([], mints, 120));
        setActivityError(error instanceof Error ? error.message : 'Failed to load activity stream.');
      } finally {
        if (isMounted) {
          setIsActivityLoading(false);
        }
      }
    }

    void loadTrackedActivities(true);
    const timer = window.setInterval(() => {
      void loadTrackedActivities(false);
    }, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [mints]);

  const mintStats = useMemo(() => {
    const total = mints.length;
    const live = mints.filter((mint) => mint.mintAt <= nowMs).length;
    const upcoming = mints.filter((mint) => mint.mintAt > nowMs).length;

    const monthKeys = buildMonthKeys(6, nowMs);
    const byMonth = new Map<string, number>();
    for (const key of monthKeys) {
      byMonth.set(key, 0);
    }
    for (const mint of mints) {
      const key = `${new Date(mint.mintAt).getFullYear()}-${String(
        new Date(mint.mintAt).getMonth() + 1
      ).padStart(2, '0')}`;
      if (byMonth.has(key)) {
        byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      }
    }

    const monthPoints = monthKeys.map((key) => ({
      key,
      label: monthLabel(key),
      value: byMonth.get(key) ?? 0
    }));
    const maxMonthly = Math.max(1, ...monthPoints.map((point) => point.value));
    const monthTrend: ChartPoint[] = monthPoints.map((point) => ({
      ...point,
      ratio: Math.round((point.value / maxMonthly) * 100)
    }));

    const chainCountMap = new Map<string, number>();
    for (const mint of mints) {
      const chain = mint.chain.trim() || 'Unknown';
      chainCountMap.set(chain, (chainCountMap.get(chain) ?? 0) + 1);
    }
    const chainRaw = Array.from(chainCountMap.entries())
      .map(([chain, value]) => ({ key: chain, label: chain, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    const maxChain = Math.max(1, ...chainRaw.map((item) => item.value), 1);
    const chainDistribution: ChartPoint[] = chainRaw.map((item) => ({
      ...item,
      ratio: Math.round((item.value / maxChain) * 100)
    }));

    return {
      total,
      live,
      upcoming,
      monthTrend,
      chainDistribution
    };
  }, [mints, nowMs]);

  const taskStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((task) => task.done).length;
    const overdue = tasks.filter((task) => !task.done && task.dueAt !== null && task.dueAt < nowMs).length;
    const active = total - done;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const statusRows = [
      { key: 'active', label: 'Active', value: active },
      { key: 'overdue', label: 'Overdue', value: overdue },
      { key: 'done', label: 'Done', value: done }
    ];

    const statusBreakdown = statusRows.map((row) => ({
      ...row,
      ratio: total > 0 ? Math.round((row.value / total) * 100) : 0
    }));

    const dayKeys = buildRecentDayKeys(7, nowMs);
    const completionMap = new Map<string, number>();
    for (const key of dayKeys) {
      completionMap.set(key, 0);
    }

    for (const task of tasks) {
      if (!task.done) continue;
      const key = dayKey(task.updatedAt);
      if (!completionMap.has(key)) continue;
      completionMap.set(key, (completionMap.get(key) ?? 0) + 1);
    }

    const trendRaw = dayKeys.map((key) => ({
      key,
      label: dayLabel(key),
      value: completionMap.get(key) ?? 0
    }));
    const maxDaily = Math.max(1, ...trendRaw.map((row) => row.value), 1);
    const completionTrend: ChartPoint[] = trendRaw.map((row) => ({
      ...row,
      ratio: Math.round((row.value / maxDaily) * 100)
    }));

    return {
      total,
      done,
      active,
      overdue,
      completionRate,
      statusBreakdown,
      completionTrend
    };
  }, [tasks, nowMs]);

  const farmingStats = useMemo(() => {
    const totalProjects = projects.length;
    const avgProgress =
      totalProjects > 0
        ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / totalProjects)
        : 0;

    const perProject = [...projects]
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 8)
      .map((project) => ({
        key: project.clientId,
        label: project.name,
        value: project.progress,
        ratio: project.progress
      }));

    const buckets = [
      { key: '0-25', label: '0-25%', count: 0 },
      { key: '26-50', label: '26-50%', count: 0 },
      { key: '51-75', label: '51-75%', count: 0 },
      { key: '76-100', label: '76-100%', count: 0 }
    ];

    for (const project of projects) {
      if (project.progress <= 25) buckets[0].count += 1;
      else if (project.progress <= 50) buckets[1].count += 1;
      else if (project.progress <= 75) buckets[2].count += 1;
      else buckets[3].count += 1;
    }

    const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.count), 1);
    const progressBuckets: ChartPoint[] = buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: bucket.count,
      ratio: Math.round((bucket.count / maxBucket) * 100)
    }));

    return {
      totalProjects,
      avgProgress,
      perProject,
      progressBuckets
    };
  }, [projects]);

  const activityStats = useMemo(() => {
    const summaryAll = summarizeTrackedActivities(trackedActivities);
    const windowStart = nowMs - 30 * 24 * 60 * 60 * 1000;
    const recent = trackedActivities.filter((entry) => entry.happenedAt >= windowStart);
    const summary30d = summarizeTrackedActivities(recent);

    const dayKeys = buildRecentDayKeys(7, nowMs);
    const byDay = new Map<string, number>();
    for (const key of dayKeys) byDay.set(key, 0);
    for (const entry of trackedActivities) {
      const key = dayKey(entry.happenedAt);
      if (!byDay.has(key)) continue;
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    const trendRaw = dayKeys.map((key) => ({
      key,
      label: dayLabel(key),
      value: byDay.get(key) ?? 0
    }));
    const maxDaily = Math.max(1, ...trendRaw.map((row) => row.value), 1);
    const trend: ChartPoint[] = trendRaw.map((row) => ({
      ...row,
      ratio: Math.round((row.value / maxDaily) * 100)
    }));

    return {
      summaryAll,
      summary30d,
      trend,
      recentEntries: trackedActivities.slice(0, 10)
    };
  }, [trackedActivities, nowMs]);

  return (
    <section className="mx-auto max-w-7xl">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="mb-6"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Insights</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Analytics Dashboard</h2>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-12">
        <GlassCard title="Mint History Stats" icon={<BarChart3 className="h-4 w-4" />} className="lg:col-span-7">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <MetricCell label="Total Mints" value={String(mintStats.total)} />
            <MetricCell label="Live/Ended" value={String(mintStats.live)} />
            <MetricCell label="Upcoming" value={String(mintStats.upcoming)} />
          </div>

          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">6-Month Mint Count</p>
          <div className="mb-4 flex h-44 items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {mintStats.monthTrend.map((point, index) => (
              <div key={point.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${Math.max(point.ratio, 6)}%`, opacity: 1 }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                  className="w-full rounded-t-lg bg-gradient-to-t from-cyan-400/30 to-blue-400/70"
                />
                <p className="text-[10px] text-slate-400">{point.label}</p>
              </div>
            ))}
          </div>

          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Top Chains</p>
          <div className="space-y-2">
            {mintStats.chainDistribution.length === 0 ? (
              <p className="text-sm text-slate-300">No mint data yet.</p>
            ) : (
              mintStats.chainDistribution.map((row, index) => (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${row.ratio}%` }}
                      transition={{ duration: 0.35, delay: index * 0.04 }}
                      className="h-full rounded-full bg-gradient-to-r from-cyan-300/90 to-emerald-300/90"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard title="Task Completion Charts" icon={<CheckCircle2 className="h-4 w-4" />} className="lg:col-span-5">
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <MetricCell label="Total Tasks" value={String(taskStats.total)} />
            <MetricCell label="Completion Rate" value={`${taskStats.completionRate}%`} />
          </div>

          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Status Breakdown</p>
          <div className="space-y-2">
            {taskStats.statusBreakdown.map((row, index) => (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${row.ratio}%` }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className="h-full rounded-full bg-gradient-to-r from-indigo-300/80 to-cyan-300/80"
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 text-xs uppercase tracking-[0.12em] text-slate-400">7-Day Completion Trend</p>
          <div className="flex h-36 items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {taskStats.completionTrend.map((point, index) => (
              <div key={point.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${Math.max(point.ratio, 6)}%`, opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                  className="w-full rounded-t-lg bg-gradient-to-t from-indigo-400/35 to-cyan-400/70"
                />
                <p className="text-[10px] text-slate-400">{point.label}</p>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard title="Wallet + Whitelist Activity" icon={<Clock3 className="h-4 w-4" />} className="lg:col-span-12">
          {isActivityLoading ? (
            <p className="text-sm text-slate-300">Loading minted, sold, and whitelist activities...</p>
          ) : (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCell label="Total Activities" value={String(activityStats.summaryAll.total)} />
                <MetricCell label="Minted NFTs (30d)" value={String(activityStats.summary30d.mintedNftCount)} />
                <MetricCell label="Sold NFTs (30d)" value={String(activityStats.summary30d.soldNftCount)} />
                <MetricCell
                  label="Whitelist Entries (30d)"
                  value={String(activityStats.summary30d.enteredWhitelistCount)}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">7-Day Activity Trend</p>
                  <div className="flex h-36 items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    {activityStats.trend.map((point, index) => (
                      <div key={point.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: `${Math.max(point.ratio, 6)}%`, opacity: 1 }}
                          transition={{ duration: 0.3, delay: index * 0.04 }}
                          className="w-full rounded-t-lg bg-gradient-to-t from-rose-400/35 to-cyan-400/70"
                        />
                        <p className="text-[10px] text-slate-400">{point.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Recent Activity</p>
                  <div className="space-y-2">
                    {activityStats.recentEntries.length === 0 ? (
                      <p className="text-sm text-slate-300">No tracked activity yet.</p>
                    ) : (
                      activityStats.recentEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className={`rounded-full border px-2 py-0.5 ${activityBadgeClass(entry.kind)}`}>
                              {activityKindLabel(entry.kind)}
                            </span>
                            <span className="text-slate-400">{formatAnalyticsTime(entry.happenedAt)}</span>
                          </div>
                          <p className="text-sm text-white">{entry.title}</p>
                          <p className="mt-0.5 text-slate-400">{entry.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {activityError ? <p className="mt-3 text-xs text-amber-200">{activityError}</p> : null}
            </>
          )}
        </GlassCard>

        <GlassCard title="NFT Portfolio Profit / Loss" icon={<Clock3 className="h-4 w-4" />} className="lg:col-span-12">
          {isPortfolioLoading ? (
            <p className="text-sm text-slate-300">Loading wallet holdings and live NFT prices...</p>
          ) : portfolioError ? (
            <div className="rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
              {portfolioError}
            </div>
          ) : portfolio ? (
            <>
              <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <MetricCell label="Tracked Wallets" value={String(portfolio.summary.trackedWallets)} />
                <MetricCell label="Minted NFTs" value={String(portfolio.summary.mintedNfts)} />
                <MetricCell label="Current Holdings" value={String(portfolio.summary.holdingsCount)} />
                <MetricCell label="Done Tasks" value={String(taskStats.done)} />
                <MetricCell
                  label="Realized PnL"
                  value={formatCurrencyRows(portfolio.summary.realizedPnl)}
                />
                <MetricCell
                  label="Unrealized PnL"
                  value={formatCurrencyRows(portfolio.summary.unrealizedPnl)}
                />
              </div>

              <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Estimated Portfolio Value</p>
                <p className="text-sm text-slate-200">{formatCurrencyRows(portfolio.summary.estimatedValue)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Live price requests: {portfolio.meta.priceCollectionsResolved}/{portfolio.meta.priceCollectionsRequested} |
                  Updated {new Date(portfolio.meta.fetchedAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-2">
                {portfolio.holdings.length === 0 ? (
                  <p className="text-sm text-slate-300">No open NFT holdings yet from tracked wallet activity.</p>
                ) : (
                  portfolio.holdings.slice(0, 12).map((holding) => (
                    <div
                      key={`${holding.tokenContract}:${holding.tokenId}`}
                      className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate text-sm text-white">
                          {holding.collectionId} #{holding.tokenId}
                        </p>
                        <p className="text-xs text-slate-400">{holding.chain}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5">
                          Qty {holding.quantity}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5">
                          Cost {holding.costBasisNative} {holding.currency}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5">
                          Live {holding.livePriceNative ?? '-'} {holding.currency}
                        </span>
                        {holding.livePriceSource ? (
                          <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 uppercase tracking-wide">
                            {holding.livePriceSource === 'ask_floor' ? 'Floor Ask' : 'Last Trade'}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5">
                          Value {holding.currentValueNative ?? '-'} {holding.currency}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 ${
                            holding.unrealizedPnlNative === null
                              ? 'border-slate-500/40 bg-slate-500/10 text-slate-300'
                              : holding.unrealizedPnlNative >= 0
                                ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                                : 'border-rose-300/40 bg-rose-300/10 text-rose-200'
                          }`}
                        >
                          PnL {holding.unrealizedPnlNative ?? '-'} {holding.currency}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-300">Portfolio data unavailable.</p>
          )}
        </GlassCard>

        <GlassCard title="Farming Progress Charts" icon={<Droplets className="h-4 w-4" />} className="lg:col-span-12">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <MetricCell label="Projects" value={String(farmingStats.totalProjects)} />
            <MetricCell label="Avg Progress" value={`${farmingStats.avgProgress}%`} />
            <MetricCell
              label="High Progress (76%+)"
              value={String(farmingStats.progressBuckets.find((bucket) => bucket.key === '76-100')?.value ?? 0)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Project Progress</p>
              <div className="space-y-2">
                {farmingStats.perProject.length === 0 ? (
                  <p className="text-sm text-slate-300">No farming projects yet.</p>
                ) : (
                  farmingStats.perProject.map((row, index) => (
                    <div key={row.key}>
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                        <span className="truncate">{row.label}</span>
                        <span>{row.value}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.ratio}%` }}
                          transition={{ duration: 0.35, delay: index * 0.04 }}
                          className="h-full rounded-full bg-gradient-to-r from-emerald-300/90 to-cyan-300/90"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Progress Distribution</p>
              <div className="flex h-44 items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {farmingStats.progressBuckets.map((bucket, index) => (
                  <div key={bucket.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: `${Math.max(bucket.ratio, 6)}%`, opacity: 1 }}
                      transition={{ duration: 0.35, delay: index * 0.05 }}
                      className="w-full rounded-t-lg bg-gradient-to-t from-emerald-400/35 to-cyan-400/70"
                    />
                    <p className="text-[10px] text-slate-400">{bucket.label}</p>
                    <p className="text-[10px] text-slate-500">{bucket.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-700/70 bg-panel px-4 py-3 text-xs text-slate-400"
      >
        <TrendingUp className="h-4 w-4 text-glow" />
        Analytics are computed from your local module data in real time.
      </motion.div>
    </section>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function activityKindLabel(kind: TrackedActivityEntry['kind']) {
  if (kind === 'minted_nft') return 'Minted NFT';
  if (kind === 'sold_nft') return 'Sold NFT';
  return 'Whitelist';
}

function activityBadgeClass(kind: TrackedActivityEntry['kind']) {
  if (kind === 'minted_nft') return 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
  if (kind === 'sold_nft') return 'border-rose-300/40 bg-rose-300/10 text-rose-200';
  return 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200';
}

function formatAnalyticsTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function formatCurrencyRows(rows: Array<{ currency: string; amount: number }>) {
  if (!rows || rows.length === 0) return '0';
  return rows
    .slice(0, 3)
    .map((row) => `${row.amount >= 0 ? '+' : ''}${round(row.amount)} ${row.currency}`)
    .join(' | ');
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
