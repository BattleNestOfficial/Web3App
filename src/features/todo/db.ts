import Dexie, { type Table } from 'dexie';
import { recordAppActivity } from '../activity/log';

export type TodoPriority = 'low' | 'medium' | 'high';
export type TodoReminderOffsetMinutes = 1440 | 120 | 60 | 30 | 10;
export type TodoSyncStatus =
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete'
  | 'synced'
  | 'error';

export const TODO_REMINDER_OPTIONS: Array<{ label: string; minutes: TodoReminderOffsetMinutes }> = [
  { label: '24h before', minutes: 1440 },
  { label: '2h before', minutes: 120 },
  { label: '1h before', minutes: 60 },
  { label: '30m before', minutes: 30 },
  { label: '10m before', minutes: 10 }
];

export type TodoTaskRecord = {
  id?: number;
  remoteId: number | null;
  clientId: string;
  title: string;
  notes: string;
  dueAt: number | null;
  priority: TodoPriority;
  done: boolean;
  reminderEmailEnabled: boolean;
  reminderOffsets: TodoReminderOffsetMinutes[];
  syncStatus: TodoSyncStatus;
  lastSyncedAt: number | null;
  syncError: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TodoTaskDraft = {
  title: string;
  notes: string;
  dueAt: number | null;
  priority: TodoPriority;
  reminderEmailEnabled: boolean;
  reminderOffsets: TodoReminderOffsetMinutes[];
};

class TodoDB extends Dexie {
  tasks!: Table<TodoTaskRecord, number>;

  constructor() {
    super('neon-todo-db');
    this.version(1).stores({
      tasks: '++id,done,dueAt,priority,updatedAt'
    });

    this.version(2)
      .stores({
        tasks: '++id,remoteId,clientId,syncStatus,done,dueAt,priority,deletedAt,updatedAt'
      })
      .upgrade(async (tx) => {
        const tasks = tx.table('tasks');
        let index = 0;
        await tasks.toCollection().modify((task) => {
          index += 1;
          const now = Date.now();
          task.remoteId = task.remoteId ?? null;
          task.clientId = task.clientId ?? `legacy-todo-${now}-${index}`;
          task.reminderEmailEnabled = task.reminderEmailEnabled ?? true;
          task.reminderOffsets = normalizeReminderOffsets(task.reminderOffsets ?? []);
          task.syncStatus = task.syncStatus ?? 'pending_create';
          task.lastSyncedAt = task.lastSyncedAt ?? null;
          task.syncError = task.syncError ?? null;
          task.deletedAt = task.deletedAt ?? null;
        });
      });
  }
}

export const todoDB = new TodoDB();

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `todo-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeReminderOffsets(offsets: unknown[]) {
  const unique = new Set<TodoReminderOffsetMinutes>();
  for (const value of offsets) {
    const parsed = Number(value) as TodoReminderOffsetMinutes;
    if (parsed === 1440 || parsed === 120 || parsed === 60 || parsed === 30 || parsed === 10) {
      unique.add(parsed);
    }
  }
  return [...unique].sort((a, b) => b - a);
}

export async function createTodoTask(draft: TodoTaskDraft) {
  const now = Date.now();
  const title = draft.title.trim() || 'Untitled task';
  const reminderOffsets = draft.dueAt ? normalizeReminderOffsets(draft.reminderOffsets) : [];
  const id = await todoDB.tasks.add({
    remoteId: null,
    clientId: createClientId(),
    title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    done: false,
    reminderEmailEnabled: draft.reminderEmailEnabled,
    reminderOffsets,
    syncStatus: 'pending_create',
    lastSyncedAt: null,
    syncError: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  });
  await recordAppActivity({
    source: 'todo',
    action: 'create_task',
    title: 'To-Do task added',
    detail: `${title} | ${draft.priority} | reminder ${draft.reminderEmailEnabled ? 'on' : 'off'}`,
    happenedAt: now
  });
  return id;
}

export async function updateTodoTask(id: number, draft: TodoTaskDraft) {
  const existing = await todoDB.tasks.get(id);
  if (!existing) return 0;
  const title = draft.title.trim() || 'Untitled task';
  const reminderOffsets = draft.dueAt ? normalizeReminderOffsets(draft.reminderOffsets) : [];
  const changed = await todoDB.tasks.update(id, {
    title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    reminderEmailEnabled: draft.reminderEmailEnabled,
    reminderOffsets,
    syncStatus: existing.remoteId ? 'pending_update' : 'pending_create',
    syncError: null,
    deletedAt: null,
    updatedAt: Date.now()
  });
  if (!changed) return changed;
  await recordAppActivity({
    source: 'todo',
    action: 'update_task',
    title: 'To-Do task updated',
    detail: `${title} | ${draft.priority} | reminder ${draft.reminderEmailEnabled ? 'on' : 'off'}`
  });
  return changed;
}

export async function toggleTodoTask(id: number, done: boolean) {
  const existing = await todoDB.tasks.get(id);
  if (!existing) return 0;
  const changed = await todoDB.tasks.update(id, {
    done,
    syncStatus: existing.remoteId ? 'pending_update' : 'pending_create',
    syncError: null,
    deletedAt: null,
    updatedAt: Date.now()
  });
  if (!changed) return changed;
  await recordAppActivity({
    source: 'todo',
    action: done ? 'complete_task' : 'reopen_task',
    title: done ? 'To-Do task completed' : 'To-Do task reopened',
    detail: `Task #${id}`
  });
  return changed;
}

export async function deleteTodoTask(id: number) {
  const existing = await todoDB.tasks.get(id);
  if (!existing) return;

  if (existing.remoteId) {
    await todoDB.tasks.update(id, {
      syncStatus: 'pending_delete',
      syncError: null,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    });
  } else {
    await todoDB.tasks.delete(id);
  }

  await recordAppActivity({
    source: 'todo',
    action: 'delete_task',
    title: existing.remoteId ? 'To-Do task scheduled for deletion' : 'To-Do task deleted',
    detail: existing.title.trim() || `Task #${id}`
  });
}
