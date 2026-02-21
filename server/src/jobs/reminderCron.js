import { markReminderSent, listDueReminders } from '../services/reminderService.js';
import {
  getEnabledNotificationChannels,
  triggerAutomationNotification,
  triggerReminderNotification
} from '../services/notificationService.js';
import {
  listDueTodoTaskReminders,
  markTodoTaskReminderSent
} from '../services/todoService.js';

const CRON_INTERVAL_MS = 60 * 1000;

let timer = null;
let isRunning = false;
let warnedNoChannels = false;

function formatTaskReminderOffset(offsetMinutes) {
  if (offsetMinutes === 1440) return '24h';
  if (offsetMinutes === 120) return '2h';
  if (offsetMinutes === 60) return '1h';
  if (offsetMinutes === 30) return '30m';
  return '10m';
}

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

    const taskReminders = await listDueTodoTaskReminders(200);
    for (const taskReminder of taskReminders) {
      const offsetLabel = formatTaskReminderOffset(taskReminder.offset_minutes);
      const runKey = `todo-task-reminder-${taskReminder.id}`;
      try {
        const result = await triggerAutomationNotification({
          workflowKey: 'todo_task_due_reminder',
          runKey,
          title: `Task reminder: ${taskReminder.task_title} in ${offsetLabel}`,
          body: `${taskReminder.task_title} is due in ${offsetLabel}. Priority: ${taskReminder.priority}.`,
          htmlContent: `
            <p><strong>Task reminder</strong></p>
            <p><strong>${taskReminder.task_title}</strong> is due in <strong>${offsetLabel}</strong>.</p>
            <p>Priority: ${taskReminder.priority}</p>
            ${
              taskReminder.due_at
                ? `<p>Due at: ${new Date(taskReminder.due_at).toISOString()}</p>`
                : ''
            }
            ${taskReminder.task_notes ? `<p>Notes: ${taskReminder.task_notes}</p>` : ''}
          `,
          metadata: {
            reminderType: 'todo_task',
            todoTaskReminderId: taskReminder.id,
            todoTaskId: taskReminder.todo_task_id,
            offsetMinutes: taskReminder.offset_minutes,
            dueAt: taskReminder.due_at,
            priority: taskReminder.priority
          }
        });
        if (result.delivered) {
          await markTodoTaskReminderSent(taskReminder.id);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[reminder-cron] Failed to process todo task reminder ${taskReminder.id}:`, error);
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
