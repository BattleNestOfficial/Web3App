import { getEnabledNotificationChannels } from '../services/notificationService.js';
import {
  runDailyBriefingWorkflow,
  runInactiveFarmingAlertWorkflow,
  runMissedTaskAlertWorkflow,
  runWeeklyProductivityReportWorkflow
} from '../services/workflowAutomationService.js';

const CRON_INTERVAL_MS = 60 * 1000;

let timer = null;
let isRunning = false;
let warnedNoChannels = false;

async function runWorkflows() {
  if (isRunning) return;
  isRunning = true;

  try {
    const channels = getEnabledNotificationChannels();
    if (channels.length === 0) {
      if (!warnedNoChannels) {
        warnedNoChannels = true;
        // eslint-disable-next-line no-console
        console.warn('[automation-cron] No notification channels configured. Skipping automation workflows.');
      }
      return;
    }

    warnedNoChannels = false;

    await runDailyBriefingWorkflow();
    await runMissedTaskAlertWorkflow();
    await runInactiveFarmingAlertWorkflow();
    await runWeeklyProductivityReportWorkflow();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[automation-cron] Workflow batch failed:', error);
  } finally {
    isRunning = false;
  }
}

export function startAutomationCron() {
  if (timer) {
    return () => undefined;
  }

  // eslint-disable-next-line no-console
  console.log('[automation-cron] Started (every minute)');
  void runWorkflows();

  timer = setInterval(() => {
    void runWorkflows();
  }, CRON_INTERVAL_MS);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      // eslint-disable-next-line no-console
      console.log('[automation-cron] Stopped');
    }
  };
}
