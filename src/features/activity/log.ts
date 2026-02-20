import Dexie, { type Table } from 'dexie';

export type AppActivitySource =
  | 'mint_tracker'
  | 'wallet_tracker'
  | 'todo'
  | 'productivity'
  | 'analytics'
  | 'farming'
  | 'bug_tracker';

export type AppActivityEvent = {
  id?: number;
  eventId: string;
  source: AppActivitySource;
  action: string;
  title: string;
  detail: string;
  happenedAt: number;
  metadata: Record<string, unknown> | null;
};

export type AppActivityDraft = {
  source: AppActivitySource;
  action: string;
  title: string;
  detail?: string;
  happenedAt?: number;
  metadata?: Record<string, unknown>;
};

class ActivityDatabase extends Dexie {
  events!: Table<AppActivityEvent, number>;

  constructor() {
    super('platform-activity-db');
    this.version(1).stores({
      events: '++id,eventId,happenedAt,source,action'
    });
  }
}

export const activityDB = new ActivityDatabase();

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function sanitize(value: unknown) {
  return String(value ?? '').trim();
}

export async function recordAppActivity(input: AppActivityDraft) {
  try {
    const happenedAt = Number.isFinite(input.happenedAt) ? Number(input.happenedAt) : Date.now();
    await activityDB.events.add({
      eventId: createEventId(),
      source: input.source,
      action: sanitize(input.action) || 'unknown_action',
      title: sanitize(input.title) || 'Activity',
      detail: sanitize(input.detail),
      happenedAt,
      metadata: input.metadata ?? null
    });

    const keepLimit = 5000;
    const total = await activityDB.events.count();
    if (total > keepLimit) {
      const overflow = total - keepLimit;
      const oldestIds = await activityDB.events.orderBy('happenedAt').limit(overflow).primaryKeys();
      await activityDB.events.bulkDelete(oldestIds as number[]);
    }
  } catch {
    // Logging must not block the primary user action.
  }
}

export async function listRecentAppActivityEvents(limit = 200) {
  return activityDB.events
    .orderBy('happenedAt')
    .reverse()
    .limit(Math.max(1, limit))
    .toArray();
}
