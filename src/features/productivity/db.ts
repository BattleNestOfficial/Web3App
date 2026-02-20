import Dexie, { type Table } from 'dexie';

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
  await productivityDB.tasks.add({
    title: draft.title.trim(),
    dueAt: draft.dueAt,
    priority: draft.priority,
    recurrence: draft.recurrence,
    status: draft.status,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateTask(id: number, draft: ProductivityTaskDraft) {
  await productivityDB.tasks.update(id, {
    title: draft.title.trim(),
    dueAt: draft.dueAt,
    priority: draft.priority,
    recurrence: draft.recurrence,
    status: draft.status,
    updatedAt: Date.now()
  });
}

export async function deleteTask(id: number) {
  await productivityDB.tasks.delete(id);
}

export async function setTaskStatus(id: number, status: TaskStatus) {
  await productivityDB.tasks.update(id, {
    status,
    updatedAt: Date.now()
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
}
