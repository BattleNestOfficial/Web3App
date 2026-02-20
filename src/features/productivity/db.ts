import Dexie, { type Table } from 'dexie';
import { recordAppActivity } from '../activity/log';

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type ProductivityTaskRecord = {
  id?: number;
  title: string;
  dueAt: number | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
};

export type ProductivityTaskDraft = {
  title: string;
  dueAt: number | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
};

class ProductivityDatabase extends Dexie {
  tasks!: Table<ProductivityTaskRecord, number>;

  constructor() {
    super('productivity-tracker-db');

    this.version(1).stores({
      tasks: '++id,status,priority,dueAt,createdAt,updatedAt'
    });
  }
}

export const productivityDB = new ProductivityDatabase();

export async function createTask(draft: ProductivityTaskDraft) {
  const now = Date.now();
  const title = draft.title.trim() || 'Untitled task';
  await productivityDB.tasks.add({
    title,
    dueAt: draft.dueAt,
    priority: draft.priority,
    recurrence: draft.recurrence,
    status: draft.status,
    createdAt: now,
    updatedAt: now
  });

  await recordAppActivity({
    source: 'productivity',
    action: 'create_task',
    title: 'Productivity task added',
    detail: `${title} | ${draft.status} | ${draft.priority}`,
    happenedAt: now
  });
}

export async function updateTask(id: number, draft: ProductivityTaskDraft) {
  const title = draft.title.trim() || 'Untitled task';
  const now = Date.now();
  const changed = await productivityDB.tasks.update(id, {
    title,
    dueAt: draft.dueAt,
    priority: draft.priority,
    recurrence: draft.recurrence,
    status: draft.status,
    updatedAt: now
  });
  if (!changed) return;
  await recordAppActivity({
    source: 'productivity',
    action: 'update_task',
    title: 'Productivity task updated',
    detail: `${title} | ${draft.status} | ${draft.priority}`,
    happenedAt: now
  });
}

export async function deleteTask(id: number) {
  const existing = await productivityDB.tasks.get(id);
  await productivityDB.tasks.delete(id);
  if (existing) {
    await recordAppActivity({
      source: 'productivity',
      action: 'delete_task',
      title: 'Productivity task deleted',
      detail: existing.title,
      happenedAt: Date.now()
    });
  }
}

export async function setTaskStatus(id: number, status: TaskStatus) {
  const existing = await productivityDB.tasks.get(id);
  if (!existing) return;
  if (existing.status === status) return;
  const now = Date.now();
  await productivityDB.tasks.update(id, {
    status,
    updatedAt: now
  });
  await recordAppActivity({
    source: 'productivity',
    action: 'set_task_status',
    title: 'Productivity task status changed',
    detail: `${existing.title} | ${existing.status} -> ${status}`,
    happenedAt: now
  });
}

export async function completeTask(id: number) {
  const task = await productivityDB.tasks.get(id);
  if (!task) return;

  if (task.recurrence === 'none') {
    await setTaskStatus(id, 'done');
    return;
  }

  const now = Date.now();
  const baseDue = task.dueAt && task.dueAt > now ? new Date(task.dueAt) : new Date(now);
  const nextDue = new Date(baseDue);

  if (task.recurrence === 'daily') nextDue.setDate(nextDue.getDate() + 1);
  if (task.recurrence === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
  if (task.recurrence === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);

  await productivityDB.tasks.update(id, {
    dueAt: nextDue.getTime(),
    status: 'todo',
    updatedAt: Date.now()
  });
  await recordAppActivity({
    source: 'productivity',
    action: 'complete_and_reschedule',
    title: 'Recurring task completed and rescheduled',
    detail: `${task.title} | next due ${new Date(nextDue.getTime()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    happenedAt: now
  });
}
