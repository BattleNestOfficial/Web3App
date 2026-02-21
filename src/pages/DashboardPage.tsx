import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'framer-motion';
import { Brain, CalendarClock, CheckCircle2, Clock3, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type JarvisRiskLevel = 'critical' | 'watch' | 'info';

type JarvisRiskAlert = {
  id: string;
  level: JarvisRiskLevel;
  message: string;
};

type JarvisRunbookItem = CompanionAgendaItem & {
  priorityScore: number;
  etaLabel: string;
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dailyAiSummary, setDailyAiSummary] = useState<DailyProductivitySummaryResult | null>(null);
  const [dailySummaryError, setDailySummaryError] = useState('');
  const [isAiLoadingDailySummary, setIsAiLoadingDailySummary] = useState(false);
  const [walletTimelineEvents, setWalletTimelineEvents] = useState<WalletActivityEvent[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');
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
  const [jarvisAutoLog, setJarvisAutoLog] = useState('Automation idle.');
  const [jarvisCommandInput, setJarvisCommandInput] = useState('');
  const [jarvisCommandOutput, setJarvisCommandOutput] = useState('Command channel idle. Awaiting instruction.');
  const [jarvisCommandHistory, setJarvisCommandHistory] = useState<string[]>([]);
  const [isJarvisExecutingCommand, setIsJarvisExecutingCommand] = useState(false);
  const jarvisNotifiedIdsRef = useRef(new Set<string>());
  const todoTasks = useLiveQuery(async () => todoDB.tasks.toArray(), []);
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
    () => buildTrackedActivityEntries(walletTimelineEvents, localMints, appActivityEvents, 12),
    [appActivityEvents, localMints, walletTimelineEvents]
  );
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
        setWalletTimelineEvents(walletEvents);
      } catch {
        if (!isMounted) return;
        setWalletTimelineEvents([]);
        setActivityError('Live wallet sync unavailable. Showing local activity only.');
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
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
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

  const pendingCompanionCount = useMemo(
    () => companionAgenda.filter((item) => item.status !== 'done').length,
    [companionAgenda]
  );
  const actionableCompanionAgenda = useMemo(
    () => companionAgenda.filter((item) => item.status !== 'done'),
    [companionAgenda]
  );
  const jarvisBriefing = useMemo(
    () => buildJarvisBriefing(operatorName, nowTick, actionableCompanionAgenda),
    [actionableCompanionAgenda, nowTick, operatorName]
  );
  const jarvisTimeBuckets = useMemo(
    () => groupAgendaByIstWindow(actionableCompanionAgenda),
    [actionableCompanionAgenda]
  );
  const jarvisRiskAlerts = useMemo(
    () => buildJarvisRiskAlerts(actionableCompanionAgenda, nowTick, resolvedDailySummary),
    [actionableCompanionAgenda, nowTick, resolvedDailySummary]
  );
  const jarvisRunbook = useMemo(
    () => buildJarvisRunbook(actionableCompanionAgenda, nowTick),
    [actionableCompanionAgenda, nowTick]
  );
  const jarvisPriorityStats = useMemo(
    () => summarizeJarvisPriorities(actionableCompanionAgenda, nowTick),
    [actionableCompanionAgenda, nowTick]
  );

  useEffect(() => {
    persistFlag('jarvis_automation_enabled', jarvisAutomationEnabled);
  }, [jarvisAutomationEnabled]);

  useEffect(() => {
    persistFlag('jarvis_notifications_enabled', jarvisNotificationsEnabled);
  }, [jarvisNotificationsEnabled]);

  useEffect(() => {
    setJarvisNotificationPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    if (!jarvisAutomationEnabled) {
      setJarvisAutoLog('Automation paused.');
      return;
    }

    const readySoon = actionableCompanionAgenda.filter((item) => {
      if (item.at === null) return false;
      const minutes = Math.floor((item.at - nowTick) / 60_000);
      return minutes >= 0 && minutes <= 15;
    });
    const overdueItems = actionableCompanionAgenda.filter((item) => item.status === 'overdue');
    setJarvisAutoLog(
      `Auto-watch active | Critical now: ${overdueItems.length} | Starting in 15m: ${readySoon.length} | Runbook: ${jarvisRunbook.length} actions`
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
    actionableCompanionAgenda,
    jarvisAutomationEnabled,
    jarvisNotificationPermission,
    jarvisNotificationsEnabled,
    nowTick,
    jarvisRunbook.length
  ]);

  async function handleToggleTaskFromCompanion(taskId: number, done: boolean) {
    setCompanionError('');
    setUpdatingTaskId(taskId);
    try {
      await toggleTodoTask(taskId, !done);
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

  async function handleRunJarvisCommand(rawCommand: string) {
    const command = rawCommand.trim();
    if (!command) {
      setJarvisCommandOutput('Command empty. Try: "automation on", "alerts on", or "open todo".');
      return;
    }

    const normalized = command.toLowerCase();
    setIsJarvisExecutingCommand(true);
    setJarvisCommandHistory((prev) => [command, ...prev].slice(0, 5));

    try {
      if (matchesJarvisCommand(normalized, ['automation on', 'enable automation', 'autopilot on'])) {
        setJarvisAutomationEnabled(true);
        setJarvisCommandOutput('Autopilot enabled.');
      } else if (matchesJarvisCommand(normalized, ['automation off', 'pause automation', 'autopilot off'])) {
        setJarvisAutomationEnabled(false);
        setJarvisCommandOutput('Autopilot paused.');
      } else if (matchesJarvisCommand(normalized, ['alerts on', 'enable alerts', 'notification on'])) {
        await handleEnableJarvisNotifications();
        setJarvisCommandOutput('Alerts command executed. Check permission status above.');
      } else if (normalized.includes('open') || normalized.includes('go to') || normalized.includes('goto')) {
        const route = resolveJarvisRoute(normalized);
        if (route) {
          navigate(route);
          setJarvisCommandOutput(`Navigating to ${route}.`);
        } else {
          setJarvisCommandOutput('Module not recognized. Try: open nft, open todo, open bugs, open api costs, open settings.');
        }
      } else {
        setJarvisCommandOutput(
          'Command not recognized. Try: "automation on/off", "alerts on", "open todo", "open nft", or "open settings".'
        );
      }
    } catch (error) {
      setJarvisCommandOutput(error instanceof Error ? error.message : 'Command execution failed.');
    } finally {
      setIsJarvisExecutingCommand(false);
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
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
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
          {isActivityLoading ? (
            <p className="text-sm text-slate-300">Loading activity stream...</p>
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

          <form
            className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              const command = jarvisCommandInput;
              setJarvisCommandInput('');
              void handleRunJarvisCommand(command);
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Command Console</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                value={jarvisCommandInput}
                onChange={(event) => setJarvisCommandInput(event.target.value)}
                placeholder='Type command, e.g. "open todo"'
                className="h-9 flex-1 rounded-lg border border-slate-700 bg-panelAlt px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300/45"
              />
              <Button type="submit" variant="secondary" className="h-9 px-3 text-xs" disabled={isJarvisExecutingCommand}>
                {isJarvisExecutingCommand ? 'Executing...' : 'Execute'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-cyan-100">{jarvisCommandOutput}</p>
            {jarvisCommandHistory.length > 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">Recent: {jarvisCommandHistory.join(' | ')}</p>
            ) : null}
          </form>

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

          {companionError ? (
            <div className="mt-3 rounded-xl border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-200">
              {companionError}
            </div>
          ) : null}

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Threat Matrix</p>
            {jarvisRiskAlerts.length === 0 ? (
              <p className="mt-1 text-xs text-slate-300">No immediate threats detected.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {jarvisRiskAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                    <p className="text-xs text-slate-200">{alert.message}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${jarvisRiskBadgeClass(alert.level)}`}>
                      {alert.level}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Autopilot Runbook (Next 6 Hours)</p>
            {jarvisRunbook.length === 0 ? (
              <p className="mt-1 text-xs text-slate-300">No high-priority action in the next 6 hours.</p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {jarvisRunbook.map((item) => (
                  <li key={`runbook-${item.id}`} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-100">{item.title}</p>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {item.etaLabel}
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

          {actionableCompanionAgenda.length === 0 ? (
            <p className="mt-3 text-sm text-slate-300">No checklist for today yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {actionableCompanionAgenda.map((item) => (
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

function persistFlag(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Ignore storage failures; automation still works for current session.
  }
}

function getBrowserNotificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
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

function buildJarvisRiskAlerts(
  agendaItems: CompanionAgendaItem[],
  nowMs: number,
  dailySummary: DailyProductivitySummaryResult | null
): JarvisRiskAlert[] {
  const alerts: JarvisRiskAlert[] = [];
  const overdueCount = agendaItems.filter((item) => item.status === 'overdue').length;
  if (overdueCount > 0) {
    alerts.push({
      id: 'overdue-actions',
      level: 'critical',
      message: `${overdueCount} action${overdueCount === 1 ? '' : 's'} are overdue. Clear these first.`
    });
  }

  const startingSoon = agendaItems.filter((item) => {
    if (item.at === null) return false;
    const minutes = minutesUntilAction(item, nowMs);
    return minutes >= 0 && minutes <= 15;
  }).length;
  if (startingSoon > 0) {
    alerts.push({
      id: 'starting-soon',
      level: 'critical',
      message: `${startingSoon} timed action${startingSoon === 1 ? '' : 's'} start within 15 minutes.`
    });
  }

  const underHour = agendaItems.filter((item) => {
    if (item.at === null) return false;
    const minutes = minutesUntilAction(item, nowMs);
    return minutes > 15 && minutes <= 60;
  }).length;
  if (underHour > 0) {
    alerts.push({
      id: 'under-hour',
      level: 'watch',
      message: `${underHour} action${underHour === 1 ? '' : 's'} are due within the next hour.`
    });
  }

  if (dailySummary && dailySummary.riskItems.length > 0) {
    alerts.push({
      id: 'ai-risk',
      level: 'watch',
      message: `AI watchlist: ${dailySummary.riskItems.slice(0, 2).join(' | ')}`
    });
  }

  if (alerts.length === 0 && agendaItems.length > 0) {
    alerts.push({
      id: 'stable',
      level: 'info',
      message: 'No hard blockers detected. Continue execution sequence.'
    });
  }

  return alerts.slice(0, 5);
}

function buildJarvisRunbook(agendaItems: CompanionAgendaItem[], nowMs: number): JarvisRunbookItem[] {
  const sixHoursFromNow = nowMs + 6 * 60 * 60 * 1000;

  return agendaItems
    .filter((item) => item.status === 'overdue' || item.at === null || item.at <= sixHoursFromNow)
    .map((item) => {
      const minutes = minutesUntilAction(item, nowMs);
      let priorityScore = 0;
      if (item.status === 'overdue') priorityScore += 1000;
      if (item.at !== null) {
        if (minutes <= 0) priorityScore += 900;
        else if (minutes <= 15) priorityScore += 700;
        else if (minutes <= 60) priorityScore += 520;
        else if (minutes <= 180) priorityScore += 320;
        else if (minutes <= 360) priorityScore += 180;
      } else {
        priorityScore += 120;
      }

      if (item.kind === 'reminder') priorityScore += 260;
      if (item.kind === 'mint') priorityScore += 190;
      if (item.kind === 'task') priorityScore += 140;
      if (item.detail.toLowerCase().includes('high priority')) priorityScore += 120;

      let etaLabel = 'Anytime';
      if (item.status === 'overdue') {
        etaLabel = 'Overdue';
      } else if (item.at !== null) {
        if (minutes <= 0) etaLabel = 'Now';
        else if (minutes < 60) etaLabel = `In ${minutes}m`;
        else etaLabel = `In ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
      }

      return {
        ...item,
        priorityScore,
        etaLabel
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8);
}

function jarvisRiskBadgeClass(level: JarvisRiskLevel) {
  if (level === 'critical') return 'border-rose-300/40 bg-rose-300/10 text-rose-200';
  if (level === 'watch') return 'border-amber-300/40 bg-amber-300/10 text-amber-200';
  return 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200';
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

function matchesJarvisCommand(normalizedInput: string, variants: string[]) {
  return variants.some((variant) => normalizedInput === variant || normalizedInput.includes(variant));
}

function resolveJarvisRoute(normalizedInput: string): string | null {
  if (normalizedInput.includes('dashboard') || normalizedInput.includes('overview')) return '/dashboard';
  if (normalizedInput.includes('analytics')) return '/analytics';
  if (normalizedInput.includes('nft') || normalizedInput.includes('mint')) return '/nft-mints';
  if (normalizedInput.includes('project') || normalizedInput.includes('testnet')) return '/farming';
  if (normalizedInput.includes('todo') || normalizedInput.includes('task')) return '/todo';
  if (normalizedInput.includes('wallet')) return '/wallet-tracker';
  if (normalizedInput.includes('bug')) return '/bugs';
  if (normalizedInput.includes('api cost') || normalizedInput.includes('api-cost') || normalizedInput.includes('cost')) {
    return '/api-costs';
  }
  if (normalizedInput.includes('setting')) return '/settings';
  return null;
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
