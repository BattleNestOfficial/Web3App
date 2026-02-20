import Dexie, { type Table } from 'dexie';
import { recordAppActivity } from '../activity/log';

export type TodoPriority = 'low' | 'medium' | 'high';

export type TodoTaskRecord = {
  id?: number;
  title: string;
  notes: string;
  dueAt: number | null;
  priority: TodoPriority;
  done: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TodoTaskDraft = {
  title: string;
  notes: string;
  dueAt: number | null;
  priority: TodoPriority;
};

class TodoDB extends Dexie {
  tasks!: Table<TodoTaskRecord, number>;

  constructor() {
    super('neon-todo-db');
    this.version(1).stores({
      tasks: '++id, done, dueAt, priority, updatedAt'
    });
  }
}

export const todoDB = new TodoDB();

export async function createTodoTask(draft: TodoTaskDraft) {
  const now = Date.now();
  const id = await todoDB.tasks.add({
    title: draft.title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    done: false,
    createdAt: now,
    updatedAt: now
  });
  await recordAppActivity({
    source: 'todo',
    action: 'create_task',
    title: 'To-Do task added',
    detail: `${draft.title.trim() || 'Untitled task'} | ${draft.priority}`,
    happenedAt: now
  });
  return id;
}

export async function updateTodoTask(id: number, draft: TodoTaskDraft) {
  const changed = await todoDB.tasks.update(id, {
    title: draft.title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    updatedAt: Date.now()
  });
  if (!changed) return changed;
  await recordAppActivity({
    source: 'todo',
    action: 'update_task',
    title: 'To-Do task updated',
    detail: `${draft.title.trim() || 'Untitled task'} | ${draft.priority}`
  });
  return changed;
}

export async function toggleTodoTask(id: number, done: boolean) {
  const changed = await todoDB.tasks.update(id, {
    done,
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
  await todoDB.tasks.delete(id);
  if (existing) {
    await recordAppActivity({
      source: 'todo',
      action: 'delete_task',
      title: 'To-Do task deleted',
      detail: existing.title.trim() || `Task #${id}`
    });
  }
}
