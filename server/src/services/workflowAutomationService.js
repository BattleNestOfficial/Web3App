import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import {
  chargeWorkflowRun,
  getWorkflowPriceCents,
  refundWorkflowCharge
} from './automationBillingService.js';
import { triggerAutomationNotification } from './notificationService.js';

const WORKFLOW_DAILY_BRIEFING = 'daily_briefing_email';
const WORKFLOW_TODO_DAILY_DIGEST = 'todo_daily_digest';
const WORKFLOW_MISSED_TASK_ALERT = 'missed_task_alert';
const WORKFLOW_INACTIVE_FARMING_ALERT = 'inactive_farming_alert';
const WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT = 'weekly_productivity_report';
const IST_OFFSET_MS = 330 * 60 * 1000;

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  return Math.max(min, Math.min(max, rounded));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatHourKey(date) {
  return `${formatDateKey(date)}-${String(date.getUTCHours()).padStart(2, '0')}`;
}

function formatIstDateKey(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getIstDayBoundsUtc(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const startUtcMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - IST_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000 - 1;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString()
  };
}

function isoWeekKey(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function beginAutomationRun(workflowKey, runKey) {
  const result = await pool.query(
    `INSERT INTO automation_runs (workflow_key, run_key, status, details)
     VALUES ($1, $2, 'started', '{}'::jsonb)
     ON CONFLICT (workflow_key, run_key)
     DO NOTHING
     RETURNING id`,
    [workflowKey, runKey]
  );

  const row = result.rows[0] ?? null;
  return {
    started: Boolean(row),
    runId: row?.id ?? null
  };
}

async function finishAutomationRun(runId, status, details) {
  if (!runId) return;
  await pool.query(
    `UPDATE automation_runs
     SET status = $2,
         details = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [runId, status, JSON.stringify(details ?? {})]
  );
}

function summarizeNotificationResult(result) {
  return {
    delivered: result.delivered,
    channels: result.channels
  };
}

async function sendWorkflowNotification({ workflowKey, runKey, title, body, htmlContent, metadata }) {
  const result = await triggerAutomationNotification({
    workflowKey,
    runKey,
    title,
    body,
    htmlContent,
    metadata
  });
  return summarizeNotificationResult(result);
}

async function applyWorkflowBilling({ workflowKey, runKey, runId, snapshot }) {
  const billing = await chargeWorkflowRun({
    workflowKey,
    runKey,
    details: {
      snapshot
    }
  });

  if (!billing.allowed) {
    await finishAutomationRun(runId, 'skipped', {
      reason: 'insufficient-automation-balance',
      billing,
      snapshot
    });
  }

  return billing;
}

async function refundWorkflowIfNeeded({ workflowKey, runKey, billing, notification }) {
  if (!billing?.charged || notification?.delivered) {
    return null;
  }

  return refundWorkflowCharge({
    workflowKey,
    runKey,
    reason: 'notification-delivery-failed',
    details: {
      notification
    }
  });
}

async function buildDailyBriefingSnapshot() {
  const [upcomingMintsResult, remindersResult, farmingResult] = await Promise.all([
    pool.query(
      `SELECT name, chain, mint_date
       FROM mints
       WHERE mint_date >= NOW()
         AND mint_date <= NOW() + INTERVAL '24 hours'
       ORDER BY mint_date ASC
       LIMIT 5`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM reminders
       WHERE sent_at IS NULL
         AND remind_at >= NOW()
         AND remind_at <= NOW() + INTERVAL '24 hours'`
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_projects,
         COALESCE(ROUND(AVG(progress))::int, 0) AS avg_progress,
         COUNT(*) FILTER (WHERE claim_date IS NOT NULL AND claim_date <= NOW() + INTERVAL '24 hours')::int AS claims_due_24h
       FROM farming_projects`
    )
  ]);

  return {
    upcomingMints: upcomingMintsResult.rows,
    remindersDue24h: remindersResult.rows[0]?.count ?? 0,
    farmingProjects: farmingResult.rows[0]?.total_projects ?? 0,
    farmingAvgProgress: farmingResult.rows[0]?.avg_progress ?? 0,
    farmingClaimsDue24h: farmingResult.rows[0]?.claims_due_24h ?? 0
  };
}

async function buildTodoDailyDigestSnapshot(now, slot) {
  const { startIso, endIso } = getIstDayBoundsUtc(now);

  const [completedResult, summaryResult, pendingResult] = await Promise.all([
    pool.query(
      `SELECT id, title, notes, priority, due_at, completed_at
       FROM todo_tasks
       WHERE done = true
         AND completed_at IS NOT NULL
         AND completed_at >= $1
         AND completed_at <= $2
       ORDER BY completed_at DESC
       LIMIT 200`,
      [startIso, endIso]
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE done = false)::int AS pending_tasks,
         COUNT(*) FILTER (WHERE done = false AND due_at IS NOT NULL AND due_at < NOW())::int AS overdue_tasks,
         COUNT(*) FILTER (
           WHERE done = false
             AND due_at IS NOT NULL
             AND due_at >= NOW()
             AND due_at <= NOW() + INTERVAL '24 hours'
         )::int AS due_next_24h
       FROM todo_tasks`
    ),
    pool.query(
      `SELECT id, title, priority, due_at
       FROM todo_tasks
       WHERE done = false
       ORDER BY due_at ASC NULLS LAST, updated_at DESC
       LIMIT 12`
    )
  ]);

  return {
    slot,
    istDate: formatIstDateKey(now),
    dayStartUtc: startIso,
    dayEndUtc: endIso,
    completedTasks: completedResult.rows,
    completedCount: completedResult.rows.length,
    totalTasks: summaryResult.rows[0]?.total_tasks ?? 0,
    pendingTasks: summaryResult.rows[0]?.pending_tasks ?? 0,
    overdueTasks: summaryResult.rows[0]?.overdue_tasks ?? 0,
    dueNext24h: summaryResult.rows[0]?.due_next_24h ?? 0,
    pendingPreview: pendingResult.rows
  };
}

async function buildMissedTasksSnapshot() {
  const lookbackHours = clampInt(env.automation.missedTaskLookbackHours, 1, 168, 24);

  const [remindersResult, overdueClaimsResult] = await Promise.all([
    pool.query(
      `SELECT
         r.id,
         r.remind_at,
         m.name AS mint_name,
         m.chain AS mint_chain,
         m.mint_date
       FROM reminders r
       INNER JOIN mints m ON m.id = r.mint_id
       WHERE r.sent_at IS NULL
         AND r.remind_at < NOW() - INTERVAL '15 minutes'
         AND r.remind_at >= NOW() - ($1::int * INTERVAL '1 hour')
       ORDER BY r.remind_at DESC
       LIMIT 10`,
      [lookbackHours]
    ),
    pool.query(
      `SELECT id, name, network, claim_date, progress
       FROM farming_projects
       WHERE claim_date IS NOT NULL
         AND claim_date < NOW()
         AND claim_date >= NOW() - ($1::int * INTERVAL '1 hour')
         AND progress < 100
       ORDER BY claim_date DESC
       LIMIT 10`,
      [lookbackHours]
    )
  ]);

  return {
    lookbackHours,
    missedReminders: remindersResult.rows,
    overdueFarmingClaims: overdueClaimsResult.rows,
    totalMissed: remindersResult.rows.length + overdueClaimsResult.rows.length
  };
}

async function buildInactiveFarmingSnapshot() {
  const inactiveDays = clampInt(env.automation.inactiveFarmingDays, 1, 60, 3);
  const result = await pool.query(
    `SELECT id, name, network, progress, updated_at
     FROM farming_projects
     WHERE progress < 100
       AND updated_at <= NOW() - ($1::int * INTERVAL '1 day')
     ORDER BY updated_at ASC
     LIMIT 20`,
    [inactiveDays]
  );

  return {
    inactiveDays,
    inactiveProjects: result.rows,
    totalInactive: result.rows.length
  };
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function buildWeeklyReportSnapshot(now) {
  const weekEnd = startOfUtcDay(now);
  const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [mintsCreatedResult, mintsUpcomingResult, remindersSentResult, farmingResult] =
    await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM mints
         WHERE created_at >= $1
           AND created_at < $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM mints
         WHERE mint_date >= $1
           AND mint_date < $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM reminders
         WHERE sent_at >= $1
           AND sent_at < $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_projects,
           COALESCE(ROUND(AVG(progress))::int, 0) AS avg_progress
         FROM farming_projects`
      )
    ]);

  return {
    periodStart: weekStart.toISOString(),
    periodEnd: weekEnd.toISOString(),
    mintsCreated: mintsCreatedResult.rows[0]?.count ?? 0,
    mintsScheduled: mintsUpcomingResult.rows[0]?.count ?? 0,
    remindersSent: remindersSentResult.rows[0]?.count ?? 0,
    farmingProjects: farmingResult.rows[0]?.total_projects ?? 0,
    farmingAvgProgress: farmingResult.rows[0]?.avg_progress ?? 0
  };
}

export async function runDailyBriefingWorkflow(now = new Date()) {
  const hour = clampInt(env.automation.dailyBriefingHourUtc, 0, 23, 8);
  if (now.getUTCHours() < hour) {
    return { workflow: WORKFLOW_DAILY_BRIEFING, state: 'waiting', reason: 'before-scheduled-hour' };
  }

  const runKey = formatDateKey(now);
  const lock = await beginAutomationRun(WORKFLOW_DAILY_BRIEFING, runKey);
  if (!lock.started) {
    return { workflow: WORKFLOW_DAILY_BRIEFING, state: 'already_ran', runKey };
  }

  let billing = null;
  let shouldRefundInCatch = false;
  try {
    const snapshot = await buildDailyBriefingSnapshot();
    billing = await applyWorkflowBilling({
      workflowKey: WORKFLOW_DAILY_BRIEFING,
      runKey,
      runId: lock.runId,
      snapshot
    });

    if (!billing.allowed) {
      return {
        workflow: WORKFLOW_DAILY_BRIEFING,
        state: 'skipped',
        reason: 'insufficient-automation-balance',
        runKey,
        priceCents: getWorkflowPriceCents(WORKFLOW_DAILY_BRIEFING)
      };
    }
    shouldRefundInCatch = Boolean(billing?.charged);

    const subject = `Daily Briefing (${runKey})`;
    const body = `Upcoming mints: ${snapshot.upcomingMints.length}. Reminders due next 24h: ${snapshot.remindersDue24h}. Farming avg progress: ${snapshot.farmingAvgProgress}%.`;
    const htmlContent = `
      <p><strong>Daily Briefing</strong> (${runKey})</p>
      <ul>
        <li>Upcoming mints (24h): ${snapshot.upcomingMints.length}</li>
        <li>Reminders due (24h): ${snapshot.remindersDue24h}</li>
        <li>Farming projects: ${snapshot.farmingProjects}</li>
        <li>Average farming progress: ${snapshot.farmingAvgProgress}%</li>
        <li>Farming claims due (24h): ${snapshot.farmingClaimsDue24h}</li>
      </ul>
    `;

    const notification = await sendWorkflowNotification({
      workflowKey: WORKFLOW_DAILY_BRIEFING,
      runKey,
      title: subject,
      body,
      htmlContent,
      metadata: snapshot
    });
    shouldRefundInCatch = !notification.delivered;
    const refund = await refundWorkflowIfNeeded({
      workflowKey: WORKFLOW_DAILY_BRIEFING,
      runKey,
      billing,
      notification
    });
    shouldRefundInCatch = false;

    await finishAutomationRun(lock.runId, notification.delivered ? 'sent' : 'failed', {
      snapshot,
      notification,
      billing,
      refund
    });

    return {
      workflow: WORKFLOW_DAILY_BRIEFING,
      state: notification.delivered ? 'sent' : 'failed',
      runKey,
      snapshot,
      billing
    };
  } catch (error) {
    let refund = null;
    if (billing?.charged && shouldRefundInCatch) {
      refund = await refundWorkflowCharge({
        workflowKey: WORKFLOW_DAILY_BRIEFING,
        runKey,
        reason: 'workflow-exception',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await finishAutomationRun(lock.runId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
      billing,
      refund
    });
    throw error;
  }
}

export async function runTodoDailyDigestWorkflow(now = new Date()) {
  const morningHour = clampInt(env.automation.todoDigestMorningHourUtc, 0, 23, 3);
  const nightHour = clampInt(env.automation.todoDigestNightHourUtc, 0, 23, 15);
  const currentHour = now.getUTCHours();

  let slot = null;
  if (currentHour === morningHour) slot = 'morning';
  if (currentHour === nightHour) slot = slot ?? 'night';

  if (!slot) {
    return { workflow: WORKFLOW_TODO_DAILY_DIGEST, state: 'waiting', reason: 'outside-schedule' };
  }

  const runKey = `${formatIstDateKey(now)}-${slot}`;
  const lock = await beginAutomationRun(WORKFLOW_TODO_DAILY_DIGEST, runKey);
  if (!lock.started) {
    return { workflow: WORKFLOW_TODO_DAILY_DIGEST, state: 'already_ran', runKey };
  }

  let billing = null;
  let shouldRefundInCatch = false;
  try {
    const snapshot = await buildTodoDailyDigestSnapshot(now, slot);
    billing = await applyWorkflowBilling({
      workflowKey: WORKFLOW_TODO_DAILY_DIGEST,
      runKey,
      runId: lock.runId,
      snapshot
    });

    if (!billing.allowed) {
      return {
        workflow: WORKFLOW_TODO_DAILY_DIGEST,
        state: 'skipped',
        reason: 'insufficient-automation-balance',
        runKey,
        priceCents: getWorkflowPriceCents(WORKFLOW_TODO_DAILY_DIGEST)
      };
    }
    shouldRefundInCatch = Boolean(billing?.charged);

    const slotLabel = slot === 'morning' ? 'Morning' : 'Night';
    const completedHeading = snapshot.completedCount === 0 ? 'No tasks completed yet today.' : `${snapshot.completedCount} task(s) completed today.`;
    const body = `${slotLabel} To-Do report (${snapshot.istDate} IST): ${completedHeading} Pending: ${snapshot.pendingTasks}. Overdue: ${snapshot.overdueTasks}. Due in next 24h: ${snapshot.dueNext24h}.`;

    const completedItemsHtml =
      snapshot.completedTasks.length === 0
        ? '<li>No completed tasks recorded for this IST day so far.</li>'
        : snapshot.completedTasks
            .map((task) => {
              const completedAtText = task.completed_at
                ? new Date(task.completed_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })
                : 'unknown time';
              const dueAtText = task.due_at
                ? new Date(task.due_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })
                : 'no due date';
              const notes = String(task.notes ?? '').trim();
              return `<li><strong>${escapeHtml(task.title)}</strong> | ${escapeHtml(task.priority)} | completed ${escapeHtml(completedAtText)} IST | due ${escapeHtml(dueAtText)} IST${notes ? ` | note: ${escapeHtml(notes)}` : ''}</li>`;
            })
            .join('');

    const pendingItemsHtml =
      snapshot.pendingPreview.length === 0
        ? '<li>No pending tasks.</li>'
        : snapshot.pendingPreview
            .map((task) => {
              const dueAtText = task.due_at
                ? new Date(task.due_at).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })
                : 'no due date';
              return `<li>${escapeHtml(task.title)} | ${escapeHtml(task.priority)} | ${escapeHtml(dueAtText)} IST</li>`;
            })
            .join('');

    const htmlContent = `
      <p><strong>${slotLabel} To-Do Digest</strong> (${escapeHtml(snapshot.istDate)} IST)</p>
      <ul>
        <li>Total tasks: ${snapshot.totalTasks}</li>
        <li>Completed today: ${snapshot.completedCount}</li>
        <li>Pending: ${snapshot.pendingTasks}</li>
        <li>Overdue: ${snapshot.overdueTasks}</li>
        <li>Due next 24h: ${snapshot.dueNext24h}</li>
      </ul>
      <p><strong>Completed Tasks (IST day)</strong></p>
      <ul>${completedItemsHtml}</ul>
      <p><strong>Pending Queue</strong></p>
      <ul>${pendingItemsHtml}</ul>
    `;

    const notification = await sendWorkflowNotification({
      workflowKey: WORKFLOW_TODO_DAILY_DIGEST,
      runKey,
      title: `${slotLabel} To-Do Daily Report (${snapshot.istDate} IST)`,
      body,
      htmlContent,
      metadata: snapshot
    });
    shouldRefundInCatch = !notification.delivered;
    const refund = await refundWorkflowIfNeeded({
      workflowKey: WORKFLOW_TODO_DAILY_DIGEST,
      runKey,
      billing,
      notification
    });
    shouldRefundInCatch = false;

    await finishAutomationRun(lock.runId, notification.delivered ? 'sent' : 'failed', {
      snapshot,
      notification,
      billing,
      refund
    });

    return {
      workflow: WORKFLOW_TODO_DAILY_DIGEST,
      state: notification.delivered ? 'sent' : 'failed',
      runKey,
      snapshot,
      billing
    };
  } catch (error) {
    let refund = null;
    if (billing?.charged && shouldRefundInCatch) {
      refund = await refundWorkflowCharge({
        workflowKey: WORKFLOW_TODO_DAILY_DIGEST,
        runKey,
        reason: 'workflow-exception',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await finishAutomationRun(lock.runId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
      billing,
      refund
    });
    throw error;
  }
}

export async function runMissedTaskAlertWorkflow(now = new Date()) {
  const runKey = formatHourKey(now);
  const lock = await beginAutomationRun(WORKFLOW_MISSED_TASK_ALERT, runKey);
  if (!lock.started) {
    return { workflow: WORKFLOW_MISSED_TASK_ALERT, state: 'already_ran', runKey };
  }

  let billing = null;
  let shouldRefundInCatch = false;
  try {
    const snapshot = await buildMissedTasksSnapshot();
    if (snapshot.totalMissed === 0) {
      await finishAutomationRun(lock.runId, 'skipped', { reason: 'no-missed-tasks', snapshot });
      return { workflow: WORKFLOW_MISSED_TASK_ALERT, state: 'skipped', runKey };
    }
    billing = await applyWorkflowBilling({
      workflowKey: WORKFLOW_MISSED_TASK_ALERT,
      runKey,
      runId: lock.runId,
      snapshot
    });

    if (!billing.allowed) {
      return {
        workflow: WORKFLOW_MISSED_TASK_ALERT,
        state: 'skipped',
        reason: 'insufficient-automation-balance',
        runKey,
        priceCents: getWorkflowPriceCents(WORKFLOW_MISSED_TASK_ALERT)
      };
    }
    shouldRefundInCatch = Boolean(billing?.charged);

    const subject = `Alert: Missed Tasks Detected (${runKey} UTC)`;
    const body = `Detected ${snapshot.totalMissed} missed task signal(s): ${snapshot.missedReminders.length} unsent reminder(s), ${snapshot.overdueFarmingClaims.length} overdue farming claim(s).`;
    const htmlContent = `
      <p><strong>Missed Task Alert</strong></p>
      <p>${body}</p>
      <p>Lookback window: ${snapshot.lookbackHours} hour(s).</p>
    `;

    const notification = await sendWorkflowNotification({
      workflowKey: WORKFLOW_MISSED_TASK_ALERT,
      runKey,
      title: subject,
      body,
      htmlContent,
      metadata: snapshot
    });
    shouldRefundInCatch = !notification.delivered;
    const refund = await refundWorkflowIfNeeded({
      workflowKey: WORKFLOW_MISSED_TASK_ALERT,
      runKey,
      billing,
      notification
    });
    shouldRefundInCatch = false;

    await finishAutomationRun(lock.runId, notification.delivered ? 'sent' : 'failed', {
      snapshot,
      notification,
      billing,
      refund
    });

    return {
      workflow: WORKFLOW_MISSED_TASK_ALERT,
      state: notification.delivered ? 'sent' : 'failed',
      runKey,
      snapshot,
      billing
    };
  } catch (error) {
    let refund = null;
    if (billing?.charged && shouldRefundInCatch) {
      refund = await refundWorkflowCharge({
        workflowKey: WORKFLOW_MISSED_TASK_ALERT,
        runKey,
        reason: 'workflow-exception',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await finishAutomationRun(lock.runId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
      billing,
      refund
    });
    throw error;
  }
}

export async function runInactiveFarmingAlertWorkflow(now = new Date()) {
  const runKey = formatHourKey(now);
  const lock = await beginAutomationRun(WORKFLOW_INACTIVE_FARMING_ALERT, runKey);
  if (!lock.started) {
    return { workflow: WORKFLOW_INACTIVE_FARMING_ALERT, state: 'already_ran', runKey };
  }

  let billing = null;
  let shouldRefundInCatch = false;
  try {
    const snapshot = await buildInactiveFarmingSnapshot();
    if (snapshot.totalInactive === 0) {
      await finishAutomationRun(lock.runId, 'skipped', { reason: 'no-inactive-projects', snapshot });
      return { workflow: WORKFLOW_INACTIVE_FARMING_ALERT, state: 'skipped', runKey };
    }
    billing = await applyWorkflowBilling({
      workflowKey: WORKFLOW_INACTIVE_FARMING_ALERT,
      runKey,
      runId: lock.runId,
      snapshot
    });

    if (!billing.allowed) {
      return {
        workflow: WORKFLOW_INACTIVE_FARMING_ALERT,
        state: 'skipped',
        reason: 'insufficient-automation-balance',
        runKey,
        priceCents: getWorkflowPriceCents(WORKFLOW_INACTIVE_FARMING_ALERT)
      };
    }
    shouldRefundInCatch = Boolean(billing?.charged);

    const subject = `Alert: Inactive Farming Projects (${runKey} UTC)`;
    const body = `Detected ${snapshot.totalInactive} inactive farming project(s) with no updates for at least ${snapshot.inactiveDays} day(s).`;
    const htmlContent = `
      <p><strong>Inactive Farming Alert</strong></p>
      <p>${body}</p>
    `;

    const notification = await sendWorkflowNotification({
      workflowKey: WORKFLOW_INACTIVE_FARMING_ALERT,
      runKey,
      title: subject,
      body,
      htmlContent,
      metadata: snapshot
    });
    shouldRefundInCatch = !notification.delivered;
    const refund = await refundWorkflowIfNeeded({
      workflowKey: WORKFLOW_INACTIVE_FARMING_ALERT,
      runKey,
      billing,
      notification
    });
    shouldRefundInCatch = false;

    await finishAutomationRun(lock.runId, notification.delivered ? 'sent' : 'failed', {
      snapshot,
      notification,
      billing,
      refund
    });

    return {
      workflow: WORKFLOW_INACTIVE_FARMING_ALERT,
      state: notification.delivered ? 'sent' : 'failed',
      runKey,
      snapshot,
      billing
    };
  } catch (error) {
    let refund = null;
    if (billing?.charged && shouldRefundInCatch) {
      refund = await refundWorkflowCharge({
        workflowKey: WORKFLOW_INACTIVE_FARMING_ALERT,
        runKey,
        reason: 'workflow-exception',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await finishAutomationRun(lock.runId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
      billing,
      refund
    });
    throw error;
  }
}

export async function runWeeklyProductivityReportWorkflow(now = new Date()) {
  const runDay = clampInt(env.automation.weeklyReportDayUtc, 0, 6, 1);
  const runHour = clampInt(env.automation.weeklyReportHourUtc, 0, 23, 8);

  if (now.getUTCDay() !== runDay || now.getUTCHours() < runHour) {
    return { workflow: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT, state: 'waiting', reason: 'outside-schedule' };
  }

  const runKey = isoWeekKey(now);
  const lock = await beginAutomationRun(WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT, runKey);
  if (!lock.started) {
    return { workflow: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT, state: 'already_ran', runKey };
  }

  let billing = null;
  let shouldRefundInCatch = false;
  try {
    const snapshot = await buildWeeklyReportSnapshot(now);
    billing = await applyWorkflowBilling({
      workflowKey: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
      runKey,
      runId: lock.runId,
      snapshot
    });

    if (!billing.allowed) {
      return {
        workflow: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
        state: 'skipped',
        reason: 'insufficient-automation-balance',
        runKey,
        priceCents: getWorkflowPriceCents(WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT)
      };
    }
    shouldRefundInCatch = Boolean(billing?.charged);

    const subject = `Weekly Productivity Report (${runKey})`;
    const body = `Week summary: ${snapshot.mintsCreated} mints created, ${snapshot.mintsScheduled} mints scheduled, ${snapshot.remindersSent} reminders sent, farming avg progress ${snapshot.farmingAvgProgress}%.`;
    const htmlContent = `
      <p><strong>Weekly Productivity Report</strong> (${runKey})</p>
      <ul>
        <li>Period: ${snapshot.periodStart} to ${snapshot.periodEnd}</li>
        <li>Mints created: ${snapshot.mintsCreated}</li>
        <li>Mints scheduled: ${snapshot.mintsScheduled}</li>
        <li>Reminders sent: ${snapshot.remindersSent}</li>
        <li>Farming projects: ${snapshot.farmingProjects}</li>
        <li>Farming average progress: ${snapshot.farmingAvgProgress}%</li>
      </ul>
    `;

    const notification = await sendWorkflowNotification({
      workflowKey: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
      runKey,
      title: subject,
      body,
      htmlContent,
      metadata: snapshot
    });
    shouldRefundInCatch = !notification.delivered;
    const refund = await refundWorkflowIfNeeded({
      workflowKey: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
      runKey,
      billing,
      notification
    });
    shouldRefundInCatch = false;

    await finishAutomationRun(lock.runId, notification.delivered ? 'sent' : 'failed', {
      snapshot,
      notification,
      billing,
      refund
    });

    return {
      workflow: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
      state: notification.delivered ? 'sent' : 'failed',
      runKey,
      snapshot,
      billing
    };
  } catch (error) {
    let refund = null;
    if (billing?.charged && shouldRefundInCatch) {
      refund = await refundWorkflowCharge({
        workflowKey: WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT,
        runKey,
        reason: 'workflow-exception',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }

    await finishAutomationRun(lock.runId, 'failed', {
      error: error instanceof Error ? error.message : String(error),
      billing,
      refund
    });
    throw error;
  }
}
