import { apiRequest } from '../../lib/apiClient';
import type { TodoReminderOffsetMinutes, TodoTaskRecord } from './db';

export { ApiRequestError } from '../../lib/apiClient';

type BackendTodoTask = {
  id: number;
  client_id: string;
  title: string;
  notes: string;
  due_at: string | null;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
  reminder_email_enabled: boolean;
  reminder_offsets: number[];
  created_at: string;
  updated_at: string;
};

type BackendResponse<T> = {
  data: T;
};

export type RemoteTodoTask = {
  remoteId: number;
  clientId: string;
  title: string;
  notes: string;
  dueAt: number | null;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
  reminderEmailEnabled: boolean;
  reminderOffsets: TodoReminderOffsetMinutes[];
  createdAt: number;
  updatedAt: number;
};

type TodoTaskUpsertPayload = {
  clientId: string;
  title: string;
  notes: string;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
  reminderEmailEnabled: boolean;
  reminderOffsets: TodoReminderOffsetMinutes[];
};

function normalizeReminderOffsets(values: unknown[]): TodoReminderOffsetMinutes[] {
  const unique = new Set<TodoReminderOffsetMinutes>();
  for (const value of values) {
    const parsed = Number(value) as TodoReminderOffsetMinutes;
    if (parsed === 1440 || parsed === 120 || parsed === 60 || parsed === 30 || parsed === 10) {
      unique.add(parsed);
    }
  }
  return [...unique].sort((a, b) => b - a);
}

function normalizeRemoteTask(input: BackendTodoTask): RemoteTodoTask {
  return {
    remoteId: input.id,
    clientId: input.client_id,
    title: input.title,
    notes: input.notes ?? '',
    dueAt: input.due_at ? new Date(input.due_at).getTime() : null,
    priority: input.priority,
    done: Boolean(input.done),
    reminderEmailEnabled: Boolean(input.reminder_email_enabled),
    reminderOffsets: normalizeReminderOffsets(Array.isArray(input.reminder_offsets) ? input.reminder_offsets : []),
    createdAt: new Date(input.created_at).getTime(),
    updatedAt: new Date(input.updated_at).getTime()
  };
}

export async function fetchRemoteTodoTasks() {
  const response = await apiRequest<BackendResponse<BackendTodoTask[]>>('/todo', undefined, { retries: 1 });
  return response.data.map(normalizeRemoteTask);
}

export async function createRemoteTodoTask(payload: TodoTaskUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendTodoTask>>(
    '/todo',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteTask(response.data);
}

export async function updateRemoteTodoTask(remoteId: number, payload: TodoTaskUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendTodoTask>>(
    `/todo/${remoteId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteTask(response.data);
}

export async function deleteRemoteTodoTask(remoteId: number) {
  await apiRequest<void>(`/todo/${remoteId}`, { method: 'DELETE' }, { retries: 1 });
}

export function toTodoTaskPayload(task: TodoTaskRecord): TodoTaskUpsertPayload {
  return {
    clientId: task.clientId,
    title: task.title,
    notes: task.notes,
    dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
    priority: task.priority,
    done: task.done,
    reminderEmailEnabled: task.reminderEmailEnabled,
    reminderOffsets: task.dueAt ? normalizeReminderOffsets(task.reminderOffsets) : []
  };
}
