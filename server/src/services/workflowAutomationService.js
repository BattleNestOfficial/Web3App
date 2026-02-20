import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import {
  chargeWorkflowRun,
  getWorkflowPriceCents,
  refundWorkflowCharge
} from './automationBillingService.js';
import { triggerAutomationNotification } from './notificationService.js';

const WORKFLOW_DAILY_BRIEFING = 'daily_briefing_email';
const WORKFLOW_MISSED_TASK_ALERT = 'missed_task_alert';
const WORKFLOW_INACTIVE_FARMING_ALERT = 'inactive_farming_alert';
const WORKFLOW_WEEKLY_PRODUCTIVITY_REPORT = 'weekly_productivity_report';

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  return Math.max(min, Math.min(max, rounded));
}

function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatHourKey(date) {
  return `${formatDateKey(date)}-${String(date.getUTCHours()).padStart(2, '0')}`;
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
  const [upcomingMintsResult, remindersResult, farmingResult, alphaResult] = await Promise.all([
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
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count
       FROM alpha_tweets
       WHERE tweeted_at >= NOW() - INTERVAL '24 hours'`
    )
  ]);

  return {
    upcomingMints: upcomingMintsResult.rows,
    remindersDue24h: remindersResult.rows[0]?.count ?? 0,
    farmingProjects: farmingResult.rows[0]?.total_projects ?? 0,
    farmingAvgProgress: farmingResult.rows[0]?.avg_progress ?? 0,
    farmingClaimsDue24h: farmingResult.rows[0]?.claims_due_24h ?? 0,
    alphaTweets24h: alphaResult.rows[0]?.count ?? 0
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

  const [mintsCreatedResult, mintsUpcomingResult, remindersSentResult, farmingResult, alphaResult] =
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
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM alpha_tweets
         WHERE tweeted_at >= $1
           AND tweeted_at < $2`,
        [weekStart.toISOString(), weekEnd.toISOString()]
      )
    ]);

  return {
    periodStart: weekStart.toISOString(),
    periodEnd: weekEnd.toISOString(),
    mintsCreated: mintsCreatedResult.rows[0]?.count ?? 0,
    mintsScheduled: mintsUpcomingResult.rows[0]?.count ?? 0,
    remindersSent: remindersSentResult.rows[0]?.count ?? 0,
    farmingProjects: farmingResult.rows[0]?.total_projects ?? 0,
    farmingAvgProgress: farmingResult.rows[0]?.avg_progress ?? 0,
    alphaTweets: alphaResult.rows[0]?.count ?? 0
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
    const body = `Upcoming mints: ${snapshot.upcomingMints.length}. Reminders due next 24h: ${snapshot.remindersDue24h}. Farming avg progress: ${snapshot.farmingAvgProgress}%. Alpha tweets (24h): ${snapshot.alphaTweets24h}.`;
    const htmlContent = `
      <p><strong>Daily Briefing</strong> (${runKey})</p>
      <ul>
        <li>Upcoming mints (24h): ${snapshot.upcomingMints.length}</li>
        <li>Reminders due (24h): ${snapshot.remindersDue24h}</li>
        <li>Farming projects: ${snapshot.farmingProjects}</li>
        <li>Average farming progress: ${snapshot.farmingAvgProgress}%</li>
        <li>Farming claims due (24h): ${snapshot.farmingClaimsDue24h}</li>
        <li>Alpha tweets (24h): ${snapshot.alphaTweets24h}</li>
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
    const body = `Week summary: ${snapshot.mintsCreated} mints created, ${snapshot.mintsScheduled} mints scheduled, ${snapshot.remindersSent} reminders sent, farming avg progress ${snapshot.farmingAvgProgress}%, alpha tweets ${snapshot.alphaTweets}.`;
    const htmlContent = `
      <p><strong>Weekly Productivity Report</strong> (${runKey})</p>
      <ul>
        <li>Period: ${snapshot.periodStart} to ${snapshot.periodEnd}</li>
        <li>Mints created: ${snapshot.mintsCreated}</li>
        <li>Mints scheduled: ${snapshot.mintsScheduled}</li>
        <li>Reminders sent: ${snapshot.remindersSent}</li>
        <li>Farming projects: ${snapshot.farmingProjects}</li>
        <li>Farming average progress: ${snapshot.farmingAvgProgress}%</li>
        <li>Alpha tweets captured: ${snapshot.alphaTweets}</li>
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
