import type { ReminderOffsetMinutes } from './db';

export type NotificationCandidate = {
  reminderId: number;
  mintId: number;
  mintName: string;
  remindAt: number;
  offsetMinutes: ReminderOffsetMinutes;
};

export function syncNotificationEnginePlaceholder(_candidates: NotificationCandidate[]) {
  // Placeholder integration point:
  // - Browser Notification API
  // - Service worker push/scheduled notifications
  // - Native app bridge
  return;
}
