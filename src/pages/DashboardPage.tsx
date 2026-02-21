import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { AlertTriangle, Brain, CalendarClock, CheckCircle2, Clock3, ExternalLink, Layers3, Target } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/providers/AuthProvider';
import {
  fetchDailyProductivitySummaryWithAi,
  type DailyProductivitySummaryResult
} from '../features/ai/api';
import { listRecentAppActivityEvents } from '../features/activity/log';
import { buildTrackedActivityEntries, type TrackedActivityEntry } from '../features/activity/stream';
import { farmingDB, type FarmingProjectRecord } from '../features/farming/db';
import { mintDB } from '../features/mints/db';
import { todoDB, toggleTodoTask, type TodoTaskRecord } from '../features/todo/db';
import { syncTodoTasksWithBackend } from '../features/todo/sync';
import { fetchWalletActivityEvents, type WalletActivityEvent } from '../features/walletTracker/api';
import { Button } from '../components/ui/Button';

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

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index);

type CompanionAgendaKind = 'task' | 'mint' | 'reminder';
type CompanionAgendaStatus = 'pending' | 'done' | 'overdue' | 'live';

type CompanionAgendaItem = {
  id: string;
  kind: CompanionAgendaKind;
  status: CompanionAgendaStatus;
  title: string;
  detail: string;
  at: number | null;
  taskId?: number;
  taskDone?: boolean;
};

type JarvisTimeWindowKey = 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime';

type JarvisTimeBucket = {
  key: JarvisTimeWindowKey;
  label: string;
  items: CompanionAgendaItem[];
};

type JarvisBriefing = {
  greeting: string;
  summary: string;
  nextAction: string;
};

type JarvisMode = 'balanced' | 'focus' | 'aggressive';

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

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dailyAiSummary, setDailyAiSummary] = useState<DailyProductivitySummaryResult | null>(null);
  const [dailySummaryError, setDailySummaryError] = useState('');
  const [isAiLoadingDailySummary, setIsAiLoadingDailySummary] = useState(false);
  const [walletTimelineEvents, setWalletTimelineEvents] = useState<WalletActivityEvent[]>([]);
  const [isWalletPulseLoading, setIsWalletPulseLoading] = useState(true);
  const [walletPulseError, setWalletPulseError] = useState('');
  const [companionError, setCompanionError] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [jarvisAutomationEnabled, setJarvisAutomationEnabled] = useState(() =>
    readPersistedFlag('jarvis_automation_enabled', true)
  );
  const [jarvisNotificationsEnabled, setJarvisNotificationsEnabled] = useState(() =>
    readPersistedFlag('jarvis_notifications_enabled', false)
  );
  const [jarvisNotificationPermission, setJarvisNotificationPermission] = useState<NotificationPermission>(
    getBrowserNotificationPermission
  );
  const [jarvisMode, setJarvisMode] = useState<JarvisMode>(() =>
    readPersistedEnum('jarvis_mode', 'balanced', ['balanced', 'focus', 'aggressive'])
  );
  const [jarvisQuietHoursEnabled, setJarvisQuietHoursEnabled] = useState(() =>
    readPersistedFlag('jarvis_quiet_hours_enabled', false)
  );
  const [jarvisQuietStartHour, setJarvisQuietStartHour] = useState(() =>
    readPersistedNumber('jarvis_quiet_start_hour', 23, 0, 23)
  );
  const [jarvisQuietEndHour, setJarvisQuietEndHour] = useState(() =>
    readPersistedNumber('jarvis_quiet_end_hour', 8, 0, 23)
  );
  const [jarvisAutoLog, setJarvisAutoLog] = useState('Automation idle.');
  const jarvisNotifiedIdsRef = useRef(new Set<string>());
  const todoTasks = useLiveQuery(
    async () => (await todoDB.tasks.toArray()).filter((task) => task.deletedAt === null),
    []
  );
  const farmingRows = useLiveQuery(
    async () => (await farmingDB.projects.toArray()).filter((project) => project.deletedAt === null),
    []
  );
  const mintRows = useLiveQuery(
    async () => (await mintDB.mints.toArray()).filter((mint) => mint.deletedAt === null),
    []
  );
  const reminderRows = useLiveQuery(async () => mintDB.reminders.toArray(), []);
  const appActivityRows = useLiveQuery(async () => listRecentAppActivityEvents(240), []);
  const localMints = useMemo(() => mintRows ?? [], [mintRows]);
  const localReminders = useMemo(() => reminderRows ?? [], [reminderRows]);
  const localFarmingProjects = useMemo(() => farmingRows ?? [], [farmingRows]);
  const localTodoTasks = useMemo(() => todoTasks ?? [], [todoTasks]);
  const appActivityEvents = useMemo(() => appActivityRows ?? [], [appActivityRows]);
  const activityTimeline = useMemo(
    () => buildTrackedActivityEntries([], [], appActivityEvents, 16),
    [appActivityEvents]
  );
  const walletPulse = useMemo(() => {
    const since24h = nowTick - 24 * 60 * 60 * 1000;
    let mintCount = 0;
    let buyCount = 0;
    let sellCount = 0;
    let totalVolume = 0;

    for (const event of walletTimelineEvents) {
      const at = new Date(event.event_at).getTime();
      if (!Number.isFinite(at) || at < since24h) continue;

      if (event.event_type === 'mint') mintCount += 1;
      if (event.event_type === 'buy') buyCount += 1;
      if (event.event_type === 'sell') sellCount += 1;

      const value = Number.parseFloat(String(event.price_value ?? ''));
      if (Number.isFinite(value)) {
        totalVolume += value;
      }
    }

    return {
      mintCount,
      buyCount,
      sellCount,
      totalVolume: Number(totalVolume.toFixed(3))
    };
  }, [nowTick, walletTimelineEvents]);
  const localFallbackSummary = useMemo(
    () =>
      buildLocalDailySummary({
        nowMs: nowTick,
        mints: localMints,
        reminders: localReminders,
        farmingProjects: localFarmingProjects,
        todoTasks: localTodoTasks
      }),
    [localFarmingProjects, localMints, localReminders, localTodoTasks, nowTick]
  );
  const resolvedDailySummary = dailyAiSummary ?? localFallbackSummary;

  useEffect(() => {
    let isMounted = true;

    async function loadDailySummary() {
      setIsAiLoadingDailySummary(true);
      setDailySummaryError('');
      try {
        const response = await fetchDailyProductivitySummaryWithAi();
        if (!isMounted) return;
        setDailyAiSummary(response);
      } catch {
        if (!isMounted) return;
        setDailySummaryError('Cloud AI summary unavailable. Showing local briefing.');
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

  const refreshWalletPulse = useCallback(async (showLoader: boolean) => {
    if (showLoader) {
      setIsWalletPulseLoading(true);
    }
    setWalletPulseError('');
    try {
      const walletEvents = await fetchWalletActivityEvents({ limit: 160 });
      setWalletTimelineEvents(walletEvents);
    } catch {
      setWalletTimelineEvents([]);
      setWalletPulseError('Wallet pulse unavailable right now.');
    } finally {
      setIsWalletPulseLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWalletPulse(true);
    const timer = window.setInterval(() => {
      void refreshWalletPulse(false);
    }, 45_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshWalletPulse]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void syncTodoTasksWithBackend();
    const onOnline = () => {
      void syncTodoTasksWithBackend();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const manualTrackedMints = useMemo(() => localMints.filter((mint) => mint.deletedAt === null), [localMints]);
  const nextTrackedMint = useMemo(
    () => manualTrackedMints.filter((mint) => mint.mintAt >= nowTick).sort((a, b) => a.mintAt - b.mintAt)[0] ?? null,
    [manualTrackedMints, nowTick]
  );
  const operatorName = useMemo(
    () => resolveOperatorName(user?.displayName ?? null, user?.email ?? null),
    [user?.displayName, user?.email]
  );
  const dayBounds = useMemo(() => getIstDayBounds(nowTick), [nowTick]);
  const tasksToday = useMemo(() => {
    const tasks = [...(todoTasks ?? [])];
    if (tasks.length === 0) return [];

    const sortTasks = (rows: TodoTaskRecord[]) =>
      rows.sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return b.updatedAt - a.updatedAt;
      });

    const dueToday = sortTasks(
      tasks.filter((task) => task.dueAt !== null && task.dueAt >= dayBounds.start && task.dueAt <= dayBounds.end)
    );
    if (dueToday.length > 0) {
      return dueToday.slice(0, 6);
    }

    return sortTasks(tasks).slice(0, 6);
  }, [todoTasks, dayBounds.end, dayBounds.start]);

  const companionAgenda = useMemo(() => {
    const mintsById = new Map<number, (typeof localMints)[number]>();
    for (const mint of localMints) {
      if (mint.id) {
        mintsById.set(mint.id, mint);
      }
    }

    const reminderItems = localReminders
      .filter((reminder) => reminder.remindAt >= dayBounds.start && reminder.remindAt <= dayBounds.end)
      .map((reminder): CompanionAgendaItem | null => {
        const mint = mintsById.get(reminder.mintId);
        if (!mint) return null;

        const status: CompanionAgendaStatus =
          reminder.triggeredAt !== null ? 'done' : reminder.remindAt < nowTick ? 'overdue' : 'pending';

        return {
          id: `reminder-${reminder.id ?? `${reminder.mintId}-${reminder.remindAt}`}`,
          kind: 'reminder',
          status,
          title: `${mint.name} reminder`,
          detail: `${formatReminderOffset(reminder.offsetMinutes)} before ${mint.visibility} mint on ${mint.chain}`,
          at: reminder.remindAt
        };
      })
      .filter((item): item is CompanionAgendaItem => item !== null);

    const mintItems: CompanionAgendaItem[] = localMints
      .filter((mint) => mint.mintAt >= dayBounds.start && mint.mintAt <= dayBounds.end)
      .map((mint) => ({
        id: `mint-${mint.id ?? mint.clientId}`,
        kind: 'mint',
        status: mint.mintAt <= nowTick ? 'live' : 'pending',
        title: `${mint.name} mint window`,
        detail: `${mint.visibility === 'whitelist' ? 'Whitelist' : 'Public'} mint on ${mint.chain}`,
        at: mint.mintAt
      }));

    const tasks = [...(todoTasks ?? [])];
    const scheduledTasks = tasks.filter(
      (task) => task.dueAt !== null && task.dueAt >= dayBounds.start && task.dueAt <= dayBounds.end
    );
    const unscheduledTasks = tasks.filter((task) => !task.done && task.dueAt === null).slice(0, 3);
    const tasksForAgenda = scheduledTasks.length > 0 ? scheduledTasks : unscheduledTasks;

    const taskItems: CompanionAgendaItem[] = tasksForAgenda.map((task) => ({
      id: `task-${task.id ?? `${task.title}-${task.updatedAt}`}`,
      kind: 'task',
      status: task.done ? 'done' : task.dueAt !== null && task.dueAt < nowTick ? 'overdue' : 'pending',
      title: task.title,
      detail:
        task.dueAt !== null
          ? `${priorityLabel(task.priority)} priority task due today`
          : `${priorityLabel(task.priority)} priority task without specific time`,
      at: task.dueAt,
      taskId: task.id,
      taskDone: task.done
    }));

    return [...reminderItems, ...mintItems, ...taskItems]
      .sort((a, b) => {
        if (a.at !== null && b.at !== null && a.at !== b.at) return a.at - b.at;
        if (a.at !== null && b.at === null) return -1;
        if (a.at === null && b.at !== null) return 1;

        const rankA = agendaKindSortRank(a.kind);
        const rankB = agendaKindSortRank(b.kind);
        if (rankA !== rankB) return rankA - rankB;
        return a.title.localeCompare(b.title);
      })
      .slice(0, 24);
  }, [dayBounds.end, dayBounds.start, localMints, localReminders, nowTick, todoTasks]);

  const actionableCompanionAgenda = useMemo(
    () => companionAgenda.filter((item) => item.status !== 'done'),
    [companionAgenda]
  );
  const modeCompanionAgenda = useMemo(
    () => applyJarvisMode(actionableCompanionAgenda, jarvisMode),
    [actionableCompanionAgenda, jarvisMode]
  );
  const pendingCompanionCount = useMemo(() => modeCompanionAgenda.length, [modeCompanionAgenda]);
  const jarvisExecutionSequence = useMemo(
    () => buildJarvisSequence(modeCompanionAgenda, nowTick, jarvisMode).slice(0, 6),
    [modeCompanionAgenda, nowTick, jarvisMode]
  );
  const jarvisBriefing = useMemo(
    () => buildJarvisBriefing(operatorName, nowTick, modeCompanionAgenda),
    [modeCompanionAgenda, nowTick, operatorName]
  );
  const jarvisTimeBuckets = useMemo(
    () => groupAgendaByIstWindow(modeCompanionAgenda),
    [modeCompanionAgenda]
  );
  const jarvisPriorityStats = useMemo(
    () => summarizeJarvisPriorities(modeCompanionAgenda, nowTick),
    [modeCompanionAgenda, nowTick]
  );
  const farmingOps = useMemo(() => {
    const activeProjects = localFarmingProjects.filter((project) => project.deletedAt === null);
    const avgProgress =
      activeProjects.length === 0
        ? 0
        : Math.round(activeProjects.reduce((total, project) => total + project.progress, 0) / activeProjects.length);
    const claimsDue24h = activeProjects.filter((project) => {
      if (project.claimAt === null) return false;
      return project.claimAt >= nowTick && project.claimAt <= nowTick + 24 * 60 * 60 * 1000;
    }).length;
    const staleProjects = activeProjects.filter((project) => nowTick - project.updatedAt > 72 * 60 * 60 * 1000).length;
    return {
      activeCount: activeProjects.length,
      avgProgress,
      claimsDue24h,
      staleProjects
    };
  }, [localFarmingProjects, nowTick]);
  const alertBusItems = useMemo(() => {
    return modeCompanionAgenda
      .filter((item) => {
        if (item.status === 'overdue') return true;
        if (item.at === null) return false;
        const minutes = Math.floor((item.at - nowTick) / 60_000);
        return minutes >= 0 && minutes <= 120;
      })
      .slice(0, 6)
      .map((item) => {
        const route = item.kind === 'task' ? '/todo' : item.kind === 'mint' ? '/nft-mints' : '/nft-mints';
        const severity: 'critical' | 'watch' | 'normal' =
          item.status === 'overdue' ? 'critical' : item.kind === 'reminder' ? 'critical' : 'watch';
        return {
          ...item,
          route,
          severity
        };
      });
  }, [modeCompanionAgenda, nowTick]);
  const missionReadiness = useMemo(() => {
    let score = 100;
    score -= jarvisPriorityStats.overdueCount * 15;
    score -= Math.max(0, jarvisPriorityStats.underHourCount - 1) * 6;
    score -= farmingOps.staleProjects * 8;
    if (!nextTrackedMint) score -= 6;
    if (tasksToday.length === 0) score -= 4;
    return Math.max(0, Math.min(100, score));
  }, [farmingOps.staleProjects, jarvisPriorityStats.overdueCount, jarvisPriorityStats.underHourCount, nextTrackedMint, tasksToday.length]);
  const jarvisDirectives = useMemo(() => {
    const directives: Array<{ id: string; title: string; detail: string; route: string; severity: 'critical' | 'watch' | 'normal' }> = [];

    if (jarvisPriorityStats.overdueCount > 0) {
      directives.push({
        id: 'overdue-focus',
        title: 'Clear overdue queue first',
        detail: `${jarvisPriorityStats.overdueCount} overdue action(s) require immediate execution.`,
        route: '/todo',
        severity: 'critical'
      });
    }

    if (nextTrackedMint) {
      directives.push({
        id: 'mint-window',
        title: 'Prepare next mint window',
        detail: `${nextTrackedMint.name} ${formatTimeUntil(nextTrackedMint.mintAt, nowTick).toLowerCase()}.`,
        route: '/nft-mints',
        severity: 'watch'
      });
    }

    if (farmingOps.claimsDue24h > 0 || farmingOps.staleProjects > 0) {
      directives.push({
        id: 'farming-focus',
        title: 'Run project/testnet maintenance',
        detail:
          farmingOps.claimsDue24h > 0
            ? `${farmingOps.claimsDue24h} claim window(s) due in 24h.`
            : `${farmingOps.staleProjects} stale project(s) need updates.`,
        route: '/farming',
        severity: farmingOps.claimsDue24h > 0 ? 'watch' : 'normal'
      });
    }

    if (walletPulse.sellCount > walletPulse.buyCount) {
      directives.push({
        id: 'wallet-balance',
        title: 'Review wallet outflow trend',
        detail: `24h sells (${walletPulse.sellCount}) exceed buys (${walletPulse.buyCount}).`,
        route: '/wallet-tracker',
        severity: 'watch'
      });
    }

    if (directives.length === 0) {
      directives.push({
        id: 'steady-state',
        title: 'System steady',
        detail: 'No critical pressure detected. Continue planned execution cadence.',
        route: '/dashboard',
        severity: 'normal'
      });
    }

    return directives.slice(0, 4);
  }, [farmingOps.claimsDue24h, farmingOps.staleProjects, jarvisPriorityStats.overdueCount, nextTrackedMint, nowTick, walletPulse.buyCount, walletPulse.sellCount]);

  useEffect(() => {
    persistFlag('jarvis_automation_enabled', jarvisAutomationEnabled);
  }, [jarvisAutomationEnabled]);

  useEffect(() => {
    persistFlag('jarvis_notifications_enabled', jarvisNotificationsEnabled);
  }, [jarvisNotificationsEnabled]);

  useEffect(() => {
    persistText('jarvis_mode', jarvisMode);
  }, [jarvisMode]);

  useEffect(() => {
    persistFlag('jarvis_quiet_hours_enabled', jarvisQuietHoursEnabled);
  }, [jarvisQuietHoursEnabled]);

  useEffect(() => {
    persistNumber('jarvis_quiet_start_hour', jarvisQuietStartHour);
  }, [jarvisQuietStartHour]);

  useEffect(() => {
    persistNumber('jarvis_quiet_end_hour', jarvisQuietEndHour);
  }, [jarvisQuietEndHour]);

  useEffect(() => {
    setJarvisNotificationPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    if (!jarvisAutomationEnabled) {
      setJarvisAutoLog('Automation paused.');
      return;
    }

    if (jarvisQuietHoursEnabled && isQuietHours(nowTick, jarvisQuietStartHour, jarvisQuietEndHour)) {
      setJarvisAutoLog(
        `Quiet hours active (${formatHourLabel(jarvisQuietStartHour)}-${formatHourLabel(jarvisQuietEndHour)} IST). Alerts suppressed.`
      );
      return;
    }

    const readySoon = modeCompanionAgenda.filter((item) => {
      if (item.at === null) return false;
      const minutes = Math.floor((item.at - nowTick) / 60_000);
      return minutes >= 0 && minutes <= 15;
    });
    const overdueItems = modeCompanionAgenda.filter((item) => item.status === 'overdue');
    setJarvisAutoLog(
      `Auto-watch active | Mode: ${jarvisMode} | Critical now: ${overdueItems.length} | Starting in 15m: ${readySoon.length}`
    );

    if (
      !jarvisNotificationsEnabled ||
      jarvisNotificationPermission !== 'granted' ||
      typeof Notification === 'undefined'
    ) {
      return;
    }

    const notifyCandidates = [...overdueItems, ...readySoon].slice(0, 4);
    for (const item of notifyCandidates) {
      const dedupeKey =
        item.status === 'overdue' ? `${item.id}:overdue` : `${item.id}:${Math.floor((item.at ?? 0) / 600_000)}`;
      if (jarvisNotifiedIdsRef.current.has(dedupeKey)) continue;

      const heading = item.status === 'overdue' ? `JARVIS Alert: Overdue ${companionKindLabel(item.kind)}` : `JARVIS Alert: ${companionKindLabel(item.kind)} in < 15m`;
      const body =
        item.at !== null ? `${item.title} at ${formatIstTime(item.at)} | ${item.detail}` : `${item.title} | ${item.detail}`;

      try {
        new Notification(heading, { body, tag: dedupeKey });
        jarvisNotifiedIdsRef.current.add(dedupeKey);
      } catch {
        // Ignore notification failures to keep automation loop resilient.
      }
    }
  }, [
    modeCompanionAgenda,
    jarvisAutomationEnabled,
    jarvisMode,
    jarvisNotificationPermission,
    jarvisNotificationsEnabled,
    jarvisQuietEndHour,
    jarvisQuietHoursEnabled,
    jarvisQuietStartHour,
    nowTick
  ]);

  async function handleToggleTaskFromCompanion(taskId: number, done: boolean) {
    setCompanionError('');
    setUpdatingTaskId(taskId);
    try {
      await toggleTodoTask(taskId, !done);
      const syncResult = await syncTodoTasksWithBackend();
      if (!syncResult.success) {
        setCompanionError(syncResult.message);
      }
    } catch (error) {
      setCompanionError(error instanceof Error ? error.message : 'Unable to update task.');
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleEnableJarvisNotifications() {
    if (typeof Notification === 'undefined') {
      setJarvisAutoLog('Browser notifications are not supported in this environment.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setJarvisNotificationPermission(permission);
      if (permission === 'granted') {
        setJarvisNotificationsEnabled(true);
        setJarvisAutoLog('Automation alerts enabled.');
      } else {
        setJarvisNotificationsEnabled(false);
        setJarvisAutoLog('Notification permission denied. Alerts disabled.');
      }
    } catch {
      setJarvisAutoLog('Notification permission request failed.');
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 170, damping: 24 }}
        className="mb-6"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Web3OS Command Deck</p>
        <h2 className="text-gradient mt-1 font-display text-2xl sm:text-3xl">Welcome back, {operatorName}</h2>
      </motion.header>

      <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 lg:grid-cols-12">
        <GlassCard
          title="Upcoming Mint"
          icon={<CalendarClock className="h-4 w-4" />}
          className="lg:col-span-4"
        >
          {nextTrackedMint ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    nextTrackedMint.visibility === 'whitelist'
                      ? 'border-indigo-300/35 bg-indigo-300/10 text-indigo-200'
                      : 'border-cyan-300/35 bg-cyan-300/10 text-cyan-200'
                  }`}
                >
                  {nextTrackedMint.visibility === 'whitelist' ? 'Whitelist' : 'Public'}
                </span>
                <p className="text-sm text-slate-200">{nextTrackedMint.name}</p>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                Starts {formatTimelineTime(nextTrackedMint.mintAt)} ({nextTrackedMint.chain})
              </p>
              <p className="mt-2 text-xs text-glow">{formatTimeUntil(nextTrackedMint.mintAt, nowTick)}</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {formatCountdownParts(nextTrackedMint.mintAt, nowTick).map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center">
                    <p className="font-display text-lg text-white">{value}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
              {nextTrackedMint.link ? (
                <a
                  href={nextTrackedMint.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center rounded-lg border border-slate-600 bg-panelAlt px-3 py-1.5 text-xs text-slate-100 transition hover:border-slate-500"
                >
                  Open mint link
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-300">
              No upcoming manual mint found. Add mints in NFT Mint Tracker.
            </p>
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
          <div className="relative pl-5">
            <div className="absolute left-[7px] top-1 h-[calc(100%-8px)] w-px bg-white/15" />
            {activityTimeline.length === 0 ? (
              <p className="text-sm text-slate-300">No create/update/delete actions captured yet.</p>
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
          </div>
        </GlassCard>

        <GlassCard title="Alert Bus" icon={<AlertTriangle className="h-4 w-4" />} className="lg:col-span-6">
          {alertBusItems.length === 0 ? (
            <p className="text-sm text-slate-300">No critical alerts in the next 2 hours.</p>
          ) : (
            <ul className="space-y-2">
              {alertBusItems.map((item) => (
                <li
                  key={`alert-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          item.severity === 'critical'
                            ? 'border border-rose-300/40 bg-rose-300/10 text-rose-200'
                            : item.severity === 'watch'
                              ? 'border border-amber-300/40 bg-amber-300/10 text-amber-200'
                              : 'border border-slate-500/50 bg-slate-500/10 text-slate-200'
                        }`}
                      >
                        {item.severity}
                      </span>
                      <p className="truncate text-sm text-white">{item.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.detail}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => navigate(item.route)}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard title="Project / Testnet Ops" icon={<Layers3 className="h-4 w-4" />} className="lg:col-span-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <MetricPill label="Active Projects" value={String(farmingOps.activeCount)} />
            <MetricPill label="Avg Progress" value={`${farmingOps.avgProgress}%`} />
            <MetricPill label="Claims Due (24h)" value={String(farmingOps.claimsDue24h)} />
            <MetricPill label="Stale (>72h)" value={String(farmingOps.staleProjects)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => navigate('/farming')}>
              Open Projects / Testnets
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => navigate('/todo')}>
              Queue Follow-up Tasks
            </Button>
          </div>
        </GlassCard>

        <GlassCard title="Web3OS Pulse" className="lg:col-span-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <MetricPill label="Mints (24h)" value={String(resolvedDailySummary.metrics.mintsUpcoming24h)} />
            <MetricPill label="Claims (24h)" value={String(resolvedDailySummary.metrics.farmingClaimsDue24h)} />
            <MetricPill label="Reminders (24h)" value={String(resolvedDailySummary.metrics.remindersDue24h)} />
            <MetricPill label="Overdue Tasks" value={String(jarvisPriorityStats.overdueCount)} />
            <MetricPill label="Wallet Mints (24h)" value={String(walletPulse.mintCount)} />
            <MetricPill label="Wallet Buys (24h)" value={String(walletPulse.buyCount)} />
            <MetricPill label="Wallet Sells (24h)" value={String(walletPulse.sellCount)} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Wallet volume (24h): {walletPulse.totalVolume} native units
          </p>
          {isWalletPulseLoading ? <p className="mt-1 text-xs text-slate-400">Refreshing wallet pulse...</p> : null}
          {walletPulseError ? <p className="mt-1 text-xs text-amber-200">{walletPulseError}</p> : null}
        </GlassCard>

        <GlassCard title="Quick Launchpad" icon={<Target className="h-4 w-4" />} className="lg:col-span-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="secondary" className="h-9 justify-start px-3 text-xs" onClick={() => navigate('/nft-mints')}>
              Add Mint Schedule
            </Button>
            <Button type="button" variant="secondary" className="h-9 justify-start px-3 text-xs" onClick={() => navigate('/todo')}>
              Add To-Do Task
            </Button>
            <Button type="button" variant="secondary" className="h-9 justify-start px-3 text-xs" onClick={() => navigate('/farming')}>
              Update Project Progress
            </Button>
            <Button type="button" variant="secondary" className="h-9 justify-start px-3 text-xs" onClick={() => navigate('/wallet-tracker')}>
              Manage Wallet Trackers
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              onClick={() => void refreshWalletPulse(true)}
            >
              Refresh Wallet Pulse
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-8 px-2.5 text-xs"
              onClick={() => navigate('/api-costs')}
            >
              Open API Cost Tracker
            </Button>
          </div>
        </GlassCard>

        <GlassCard title="JARVIS AI Assistant" icon={<Brain className="h-4 w-4" />} className="lg:col-span-8">
          <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3">
            <p className="text-sm font-medium text-cyan-100">{jarvisBriefing.greeting}</p>
            <p className="mt-1 text-xs text-cyan-200/90">
              {formatIstDateHeadline(nowTick)} | {pendingCompanionCount} action{pendingCompanionCount === 1 ? '' : 's'} queued.
            </p>
            <p className="mt-2 text-xs text-slate-200">{jarvisBriefing.summary}</p>
            {jarvisBriefing.nextAction ? <p className="mt-1 text-xs text-cyan-100">{jarvisBriefing.nextAction}</p> : null}
            <p className="mt-2 text-[11px] text-slate-300">
              This day plan is generated from your NFT Mint Tracker + Task Planner for the current IST day.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  missionReadiness >= 80
                    ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                    : missionReadiness >= 55
                      ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                      : 'border-rose-300/40 bg-rose-300/10 text-rose-200'
                }`}
              >
                Mission Readiness {missionReadiness}%
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  jarvisAutomationEnabled
                    ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
                    : 'border-slate-500/50 bg-slate-500/10 text-slate-200'
                }`}
              >
                Automation {jarvisAutomationEnabled ? 'On' : 'Off'}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                  jarvisNotificationsEnabled && jarvisNotificationPermission === 'granted'
                    ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
                    : 'border-slate-500/50 bg-slate-500/10 text-slate-200'
                }`}
              >
                Alerts {jarvisNotificationsEnabled && jarvisNotificationPermission === 'granted' ? 'On' : 'Off'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                Permission: {jarvisNotificationPermission}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-300">{jarvisAutoLog}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={jarvisAutomationEnabled ? 'secondary' : 'ghost'}
              className="h-8 px-2.5 text-xs"
              onClick={() => setJarvisAutomationEnabled((prev) => !prev)}
            >
              {jarvisAutomationEnabled ? 'Pause Automation' : 'Enable Automation'}
            </Button>
            <Button
              type="button"
              variant={jarvisNotificationsEnabled ? 'secondary' : 'ghost'}
              className="h-8 px-2.5 text-xs"
              onClick={() => void handleEnableJarvisNotifications()}
            >
              {jarvisNotificationsEnabled ? 'Recheck Alerts Permission' : 'Enable Alerts'}
            </Button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Mission Mode</span>
              <select
                value={jarvisMode}
                onChange={(event) => setJarvisMode(event.target.value as JarvisMode)}
                className="h-9 w-full rounded-lg border border-slate-700 bg-panelAlt px-2.5 text-xs text-white focus:border-cyan-300/45 focus:outline-none"
              >
                <option value="balanced">Balanced</option>
                <option value="focus">Focus</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Quiet Hours</span>
              <button
                type="button"
                className={`h-9 w-full rounded-lg border px-2.5 text-xs ${
                  jarvisQuietHoursEnabled
                    ? 'border-cyan-300/45 bg-cyan-300/10 text-cyan-200'
                    : 'border-slate-700 bg-panelAlt text-slate-300'
                }`}
                onClick={() => setJarvisQuietHoursEnabled((prev) => !prev)}
              >
                {jarvisQuietHoursEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </label>
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Quiet Window (IST)</span>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={jarvisQuietStartHour}
                  onChange={(event) => setJarvisQuietStartHour(Number.parseInt(event.target.value, 10))}
                  className="h-9 rounded-lg border border-slate-700 bg-panelAlt px-2 text-xs text-white focus:border-cyan-300/45 focus:outline-none"
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={`quiet-start-${hour}`} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
                <select
                  value={jarvisQuietEndHour}
                  onChange={(event) => setJarvisQuietEndHour(Number.parseInt(event.target.value, 10))}
                  className="h-9 rounded-lg border border-slate-700 bg-panelAlt px-2 text-xs text-white focus:border-cyan-300/45 focus:outline-none"
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={`quiet-end-${hour}`} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Overdue</p>
              <p className="mt-1 text-sm text-rose-200">{jarvisPriorityStats.overdueCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Starts Under 60m</p>
              <p className="mt-1 text-sm text-amber-200">{jarvisPriorityStats.underHourCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">High Priority Queue</p>
              <p className="mt-1 text-sm text-cyan-200">{jarvisPriorityStats.highPriorityCount}</p>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Tactical Directives</p>
            <ul className="mt-2 space-y-1.5">
              {jarvisDirectives.map((directive) => (
                <li
                  key={directive.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-100">{directive.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        directive.severity === 'critical'
                          ? 'border border-rose-300/40 bg-rose-300/10 text-rose-200'
                          : directive.severity === 'watch'
                            ? 'border border-amber-300/40 bg-amber-300/10 text-amber-200'
                            : 'border border-slate-500/50 bg-slate-500/10 text-slate-200'
                      }`}
                    >
                      {directive.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{directive.detail}</p>
                  <div className="mt-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => navigate(directive.route)}
                    >
                      Execute
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {companionError ? (
            <div className="mt-3 rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
              {companionError}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Execution Sequence</p>
            {jarvisExecutionSequence.length === 0 ? (
              <p className="mt-1 text-xs text-slate-300">No mission sequence generated for this mode.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {jarvisExecutionSequence.map((item, index) => (
                  <li key={`sequence-${item.id}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-100">
                        {index + 1}. {item.title}
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${companionStatusBadgeClass(item.status)}`}>
                        {item.at !== null ? formatIstTime(item.at) : 'Anytime'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{item.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {jarvisTimeBuckets.some((bucket) => bucket.items.length > 0) ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {jarvisTimeBuckets
                .filter((bucket) => bucket.items.length > 0)
                .map((bucket) => (
                  <div key={bucket.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">{bucket.label}</p>
                    <p className="mt-1 text-sm text-slate-100">
                      {bucket.items.length} action{bucket.items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
            </div>
          ) : null}

          {modeCompanionAgenda.length === 0 ? (
            <p className="mt-3 text-sm text-slate-300">No checklist for today yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {modeCompanionAgenda.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${companionKindBadgeClass(item.kind)}`}
                      >
                        {companionKindLabel(item.kind)}
                      </span>
                      <p className={`truncate text-sm ${item.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                        {item.title}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${companionStatusBadgeClass(item.status)}`}>
                      {item.at !== null ? formatIstTime(item.at) : 'Anytime'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{item.detail}</p>
                  {item.kind === 'task' && item.taskId ? (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2.5 text-xs"
                        onClick={() => void handleToggleTaskFromCompanion(item.taskId!, Boolean(item.taskDone))}
                        disabled={updatingTaskId === item.taskId}
                      >
                        {updatingTaskId === item.taskId
                          ? 'Updating...'
                          : item.taskDone
                            ? 'Mark Pending'
                            : 'Mark Done'}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {isAiLoadingDailySummary && dailyAiSummary === null ? (
            <p className="mt-3 text-xs text-slate-400">Refreshing AI companion insights...</p>
          ) : null}
          {dailySummaryError ? <p className="mt-3 text-xs text-amber-200">{dailySummaryError}</p> : null}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">AI Insight</p>
            <p className="mt-1 text-xs text-slate-200">{resolvedDailySummary.summary}</p>
            {resolvedDailySummary.focusItems.length > 0 ? (
              <p className="mt-2 text-xs text-cyan-200">Focus: {resolvedDailySummary.focusItems.slice(0, 2).join(' | ')}</p>
            ) : null}
            {resolvedDailySummary.riskItems.length > 0 ? (
              <p className="mt-1 text-xs text-amber-200">Watch: {resolvedDailySummary.riskItems.slice(0, 2).join(' | ')}</p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-400">
              {resolvedDailySummary.source.toUpperCase()} |{' '}
              {new Date(resolvedDailySummary.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            </p>
          </div>
        </GlassCard>

      </motion.div>
    </section>
  );
}

function formatTimeUntil(value: string | number, nowMs: number) {
  const targetMs = new Date(value).getTime();
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
  if (kind === 'app_activity') return 'border-amber-300/50 bg-amber-300/20';
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

function formatCountdownParts(value: string | number, nowMs: number) {
  const targetMs = new Date(value).getTime();
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

function resolveOperatorName(displayName: string | null, email: string | null) {
  const name = String(displayName ?? '').trim();
  if (name) return name.split(/\s+/)[0];
  const emailName = String(email ?? '').trim();
  if (emailName.includes('@')) return emailName.split('@')[0];
  return 'Operator';
}

function buildCompanionGreeting(operatorName: string, nowMs: number) {
  const shifted = new Date(nowMs + 330 * 60 * 1000);
  const hour = shifted.getUTCHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Good night';
  return `${greeting}, ${operatorName}. Let's execute today's mission.`;
}

function formatIstDateHeadline(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  });
}

function formatIstTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function readPersistedFlag(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

function readPersistedNumber(key: string, fallback: number, min: number, max: number) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  } catch {
    return fallback;
  }
}

function readPersistedEnum<T extends string>(key: string, fallback: T, allowed: T[]) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    return fallback;
  }
}

function persistFlag(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore storage failures; automation still works for current session.
  }
}

function persistNumber(key: string, value: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures; automation still works for current session.
  }
}

function persistText(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures; automation still works for current session.
  }
}

function getBrowserNotificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

function formatHourLabel(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const period = normalized >= 12 ? 'PM' : 'AM';
  const h = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${String(h).padStart(2, '0')}:00 ${period}`;
}

function isQuietHours(nowMs: number, startHour: number, endHour: number) {
  if (startHour === endHour) return false;
  const currentHour = getIstHour(nowMs);
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }
  return currentHour >= startHour || currentHour < endHour;
}

function minutesUntilAction(item: CompanionAgendaItem, nowMs: number) {
  if (item.at === null) return Number.POSITIVE_INFINITY;
  return Math.floor((item.at - nowMs) / 60_000);
}

function summarizeJarvisPriorities(agendaItems: CompanionAgendaItem[], nowMs: number) {
  const overdueCount = agendaItems.filter((item) => item.status === 'overdue').length;
  const underHourCount = agendaItems.filter((item) => {
    if (item.at === null) return false;
    const minutes = minutesUntilAction(item, nowMs);
    return minutes >= 0 && minutes <= 60;
  }).length;
  const highPriorityCount = agendaItems.filter((item) => {
    const minutes = minutesUntilAction(item, nowMs);
    if (item.status === 'overdue') return true;
    if (minutes <= 120) return true;
    if (item.kind === 'reminder' && minutes <= 180) return true;
    return item.detail.toLowerCase().includes('high priority');
  }).length;

  return { overdueCount, underHourCount, highPriorityCount };
}

function applyJarvisMode(items: CompanionAgendaItem[], mode: JarvisMode) {
  if (mode === 'balanced') return items;

  if (mode === 'focus') {
    return items.filter((item) => {
      if (item.status === 'overdue') return true;
      if (item.kind !== 'task') return true;
      const detail = item.detail.toLowerCase();
      return detail.includes('high') || detail.includes('medium');
    });
  }

  return [...items].sort((a, b) => {
    const rank = (item: CompanionAgendaItem) => {
      if (item.status === 'overdue') return 0;
      if (item.kind === 'reminder') return 1;
      if (item.kind === 'mint') return 2;
      return 3;
    };
    const delta = rank(a) - rank(b);
    if (delta !== 0) return delta;
    if (a.at !== null && b.at !== null && a.at !== b.at) return a.at - b.at;
    if (a.at !== null && b.at === null) return -1;
    if (a.at === null && b.at !== null) return 1;
    return a.title.localeCompare(b.title);
  });
}

function buildJarvisSequence(items: CompanionAgendaItem[], nowMs: number, mode: JarvisMode) {
  const weighted = items.map((item) => {
    const minutes = minutesUntilAction(item, nowMs);
    let score = 0;

    if (item.status === 'overdue') score += 1000;
    if (item.at !== null) {
      if (minutes <= 0) score += 900;
      else if (minutes <= 15) score += 700;
      else if (minutes <= 60) score += 520;
      else if (minutes <= 180) score += 340;
      else score += 120;
    } else {
      score += 80;
    }

    if (item.kind === 'reminder') score += 220;
    if (item.kind === 'mint') score += 160;
    if (item.kind === 'task') score += 120;

    const detail = item.detail.toLowerCase();
    if (detail.includes('high')) score += 120;
    if (detail.includes('medium')) score += 60;

    if (mode === 'aggressive' && item.kind === 'mint') score += 80;
    if (mode === 'aggressive' && item.kind === 'reminder') score += 60;
    if (mode === 'focus' && item.kind === 'task') score += 40;

    return { item, score };
  });

  return weighted
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

function buildJarvisBriefing(operatorName: string, nowMs: number, agendaItems: CompanionAgendaItem[]): JarvisBriefing {
  const greeting = `${buildCompanionGreeting(operatorName, nowMs)} JARVIS online.`;
  if (agendaItems.length === 0) {
    return {
      greeting,
      summary: 'No timed actions are queued for today. Add tasks or mints, and I will build your day schedule.',
      nextAction: ''
    };
  }

  const timedCount = agendaItems.filter((item) => item.at !== null).length;
  const anytimeCount = agendaItems.length - timedCount;
  const nextItem = agendaItems[0];
  const summaryParts = [
    `${timedCount} timed action${timedCount === 1 ? '' : 's'} planned`,
    anytimeCount > 0 ? `${anytimeCount} flexible action${anytimeCount === 1 ? '' : 's'}` : null
  ].filter((part): part is string => Boolean(part));

  return {
    greeting,
    summary: `Today's mission plan: ${summaryParts.join(' | ')}.`,
    nextAction: `Next action: ${nextItem.title}${nextItem.at ? ` at ${formatIstTime(nextItem.at)}` : ' anytime'}.`
  };
}

function buildLocalDailySummary(input: {
  nowMs: number;
  mints: Array<{ mintAt: number; deletedAt: number | null }>;
  reminders: Array<{ remindAt: number; triggeredAt: number | null }>;
  farmingProjects: FarmingProjectRecord[];
  todoTasks: TodoTaskRecord[];
}): DailyProductivitySummaryResult {
  const windowEnd = input.nowMs + 24 * 60 * 60 * 1000;
  const activeMints = input.mints.filter((mint) => mint.deletedAt === null);
  const activeFarmingProjects = input.farmingProjects.filter((project) => project.deletedAt === null);

  const metrics = {
    mintsUpcoming24h: activeMints.filter((mint) => mint.mintAt >= input.nowMs && mint.mintAt <= windowEnd).length,
    remindersDue24h: input.reminders.filter(
      (reminder) => reminder.triggeredAt === null && reminder.remindAt >= input.nowMs && reminder.remindAt <= windowEnd
    ).length,
    farmingProjects: activeFarmingProjects.length,
    farmingAvgProgress:
      activeFarmingProjects.length === 0
        ? 0
        : Math.round(
            activeFarmingProjects.reduce((total, project) => total + project.progress, 0) / activeFarmingProjects.length
          ),
    farmingClaimsDue24h: activeFarmingProjects.filter(
      (project) => project.claimAt !== null && project.claimAt >= input.nowMs && project.claimAt <= windowEnd
    ).length
  };

  const tasksDue24h = input.todoTasks.filter(
    (task) => !task.done && task.dueAt !== null && task.dueAt >= input.nowMs && task.dueAt <= windowEnd
  ).length;
  const overdueTasks = input.todoTasks.filter(
    (task) => !task.done && task.dueAt !== null && task.dueAt < input.nowMs
  ).length;

  const focusItems: string[] = [];
  const riskItems: string[] = [];

  if (metrics.mintsUpcoming24h > 0) {
    focusItems.push(`Prepare ${metrics.mintsUpcoming24h} upcoming mint event(s) in the next 24h.`);
  }
  if (tasksDue24h > 0) {
    focusItems.push(`Complete ${tasksDue24h} task(s) due in the next 24h.`);
  }
  if (metrics.farmingClaimsDue24h > 0) {
    focusItems.push(`Process ${metrics.farmingClaimsDue24h} farming claim reminder(s) due in 24h.`);
  }
  if (overdueTasks > 0) {
    riskItems.push(`${overdueTasks} task(s) are overdue and need immediate action.`);
  }
  if (metrics.remindersDue24h > 8) {
    riskItems.push('High reminder volume detected; prioritize strict time windows first.');
  }
  if (metrics.farmingAvgProgress < 50 && metrics.farmingProjects > 0) {
    riskItems.push('Average farming progress is below 50%; prioritize high-yield tasks.');
  }

  return {
    summary: `Local briefing: ${metrics.mintsUpcoming24h} mint(s), ${tasksDue24h} due task(s), and ${metrics.farmingClaimsDue24h} farming claim(s) in the next 24h.`,
    focusItems,
    riskItems,
    metrics,
    generatedAt: new Date(input.nowMs).toISOString(),
    source: 'fallback'
  };
}

function groupAgendaByIstWindow(items: CompanionAgendaItem[]): JarvisTimeBucket[] {
  const buckets: JarvisTimeBucket[] = [
    { key: 'morning', label: 'Morning', items: [] },
    { key: 'afternoon', label: 'Afternoon', items: [] },
    { key: 'evening', label: 'Evening', items: [] },
    { key: 'night', label: 'Night', items: [] },
    { key: 'anytime', label: 'Anytime', items: [] }
  ];
  const bucketMap = new Map<JarvisTimeWindowKey, JarvisTimeBucket>(buckets.map((bucket) => [bucket.key, bucket]));

  for (const item of items) {
    const key = resolveJarvisWindowKey(item.at);
    bucketMap.get(key)?.items.push(item);
  }

  return buckets;
}

function resolveJarvisWindowKey(timestamp: number | null): JarvisTimeWindowKey {
  if (timestamp === null) return 'anytime';
  const hour = getIstHour(timestamp);
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night';
}

function getIstHour(timestamp: number) {
  const shifted = new Date(timestamp + 330 * 60 * 1000);
  return shifted.getUTCHours();
}

function priorityLabel(priority: TodoTaskRecord['priority']) {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  return 'Low';
}

function formatReminderOffset(minutes: number) {
  if (minutes === 60) return '1h';
  if (minutes === 30) return '30m';
  return '10m';
}

function agendaKindSortRank(kind: CompanionAgendaKind) {
  if (kind === 'reminder') return 0;
  if (kind === 'mint') return 1;
  return 2;
}

function companionKindLabel(kind: CompanionAgendaKind) {
  if (kind === 'reminder') return 'Reminder';
  if (kind === 'mint') return 'Mint';
  return 'Task';
}

function companionKindBadgeClass(kind: CompanionAgendaKind) {
  if (kind === 'reminder') return 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200';
  if (kind === 'mint') return 'border-indigo-300/40 bg-indigo-300/10 text-indigo-200';
  return 'border-amber-300/40 bg-amber-300/10 text-amber-200';
}

function companionStatusBadgeClass(status: CompanionAgendaStatus) {
  if (status === 'done') return 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
  if (status === 'overdue') return 'border border-rose-300/40 bg-rose-300/10 text-rose-200';
  if (status === 'live') return 'border border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-200';
  return 'border border-slate-500/50 bg-slate-500/10 text-slate-200';
}

function getIstDayBounds(timestamp: number) {
  const offsetMs = 330 * 60 * 1000;
  const shifted = new Date(timestamp + offsetMs);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offsetMs;
  return { start, end: start + 24 * 60 * 60 * 1000 - 1 };
}
