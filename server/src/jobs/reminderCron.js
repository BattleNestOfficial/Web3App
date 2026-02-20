import { markReminderSent, listDueReminders } from '../services/reminderService.js';
import {
  getEnabledNotificationChannels,
  triggerReminderNotification
} from '../services/notificationService.js';

const CRON_INTERVAL_MS = 60 * 1000;

let timer = null;
let isRunning = false;
let warnedNoChannels = false;

async function processReminderBatch() {
  if (isRunning) return;
  isRunning = true;

  try {
    const channels = getEnabledNotificationChannels();
    if (channels.length === 0) {
      if (!warnedNoChannels) {
        warnedNoChannels = true;
        // eslint-disable-next-line no-console
        console.warn('[reminder-cron] No notification channels configured. Skipping reminder batch.');
      }
      return;
    }

    warnedNoChannels = false;
    const reminders = await listDueReminders(200);
    for (const reminder of reminders) {
      try {
        const result = await triggerReminderNotification(reminder);
        if (result.delivered) {
          await markReminderSent(reminder.id);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[reminder-cron] Failed to process reminder ${reminder.id}:`, error);
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[reminder-cron] Batch failed:', error);
  } finally {
    isRunning = false;
  }
}

export function startReminderCron() {
  if (timer) {
    return () => undefined;
  }

  // eslint-disable-next-line no-console
  console.log('[reminder-cron] Started (every minute)');
  void processReminderBatch();

  timer = setInterval(() => {
    void processReminderBatch();
  }, CRON_INTERVAL_MS);

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      // eslint-disable-next-line no-console
      console.log('[reminder-cron] Stopped');
    }
  };
}
