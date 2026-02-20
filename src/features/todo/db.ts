import Dexie, { type Table } from 'dexie';

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
  return todoDB.tasks.add({
    title: draft.title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    done: false,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateTodoTask(id: number, draft: TodoTaskDraft) {
  return todoDB.tasks.update(id, {
    title: draft.title,
    notes: draft.notes,
    dueAt: draft.dueAt,
    priority: draft.priority,
    updatedAt: Date.now()
  });
}

export async function toggleTodoTask(id: number, done: boolean) {
  return todoDB.tasks.update(id, {
    done,
    updatedAt: Date.now()
  });
}

export async function deleteTodoTask(id: number) {
  return todoDB.tasks.delete(id);
}
