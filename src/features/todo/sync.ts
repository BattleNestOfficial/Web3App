import { todoDB, type TodoTaskRecord } from './db';
import {
  ApiRequestError,
  createRemoteTodoTask,
  deleteRemoteTodoTask,
  fetchRemoteTodoTasks,
  toTodoTaskPayload,
  updateRemoteTodoTask
} from './api';

export type SyncResult = {
  success: boolean;
  message: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function reminderFingerprint(offsets: number[]) {
  return [...new Set(offsets)].sort((a, b) => b - a).join(',');
}

function taskFingerprint(input: {
  title: string;
  notes: string;
  dueAt: number | null;
  priority: string;
  done: boolean;
  reminderEmailEnabled: boolean;
  reminderOffsets: number[];
}) {
  return [
    normalize(input.title),
    normalize(input.notes),
    String(input.dueAt ?? 0),
    normalize(input.priority),
    input.done ? '1' : '0',
    input.reminderEmailEnabled ? '1' : '0',
    reminderFingerprint(input.reminderOffsets)
  ].join('|');
}

async function markSyncError(localTaskId: number, message: string) {
  const existing = await todoDB.tasks.get(localTaskId);
  if (!existing) return;

  const fallbackStatus = existing.remoteId ? 'pending_update' : 'pending_create';
  await todoDB.tasks.update(localTaskId, {
    syncStatus: existing.syncStatus === 'pending_delete' ? 'pending_delete' : fallbackStatus,
    syncError: message,
    updatedAt: Date.now()
  });
}

async function syncPendingDeletes() {
  const pendingDeletes = await todoDB.tasks.where('syncStatus').equals('pending_delete').toArray();

  for (const task of pendingDeletes) {
    if (!task.id) continue;
    try {
      if (task.remoteId) {
        await deleteRemoteTodoTask(task.remoteId);
      }
      await todoDB.tasks.delete(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync delete.';
      await markSyncError(task.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        throw error;
      }
    }
  }
}

async function syncPendingUpserts() {
  const pendingTasks = await todoDB.tasks
    .filter(
      (task) =>
        task.deletedAt === null &&
        (task.syncStatus === 'pending_create' || task.syncStatus === 'pending_update' || task.syncStatus === 'error')
    )
    .toArray();

  for (const task of pendingTasks) {
    if (!task.id) continue;
    try {
      const payload = toTodoTaskPayload(task);
      const remoteTask = task.remoteId
        ? await updateRemoteTodoTask(task.remoteId, payload)
        : await createRemoteTodoTask(payload);

      await todoDB.tasks.update(task.id, {
        remoteId: remoteTask.remoteId,
        clientId: remoteTask.clientId,
        title: remoteTask.title,
        notes: remoteTask.notes,
        dueAt: remoteTask.dueAt,
        priority: remoteTask.priority,
        done: remoteTask.done,
        reminderEmailEnabled: remoteTask.reminderEmailEnabled,
        reminderOffsets: remoteTask.reminderOffsets,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteTask.createdAt,
        updatedAt: remoteTask.updatedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync task.';
      await markSyncError(task.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        throw error;
      }
    }
  }
}

async function mergeRemoteTasks() {
  const remoteTasks = await fetchRemoteTodoTasks();
  const localTasks = await todoDB.tasks.toArray();

  const localByRemoteId = new Map<number, TodoTaskRecord>();
  const localByClientId = new Map<string, TodoTaskRecord>();
  const localByFingerprint = new Map<string, TodoTaskRecord>();

  for (const localTask of localTasks) {
    if (localTask.remoteId) {
      localByRemoteId.set(localTask.remoteId, localTask);
    }
    localByClientId.set(localTask.clientId, localTask);

    if (localTask.deletedAt === null) {
      localByFingerprint.set(
        taskFingerprint({
          title: localTask.title,
          notes: localTask.notes,
          dueAt: localTask.dueAt,
          priority: localTask.priority,
          done: localTask.done,
          reminderEmailEnabled: localTask.reminderEmailEnabled,
          reminderOffsets: localTask.reminderOffsets
        }),
        localTask
      );
    }
  }

  for (const remoteTask of remoteTasks) {
    const fingerprint = taskFingerprint({
      title: remoteTask.title,
      notes: remoteTask.notes,
      dueAt: remoteTask.dueAt,
      priority: remoteTask.priority,
      done: remoteTask.done,
      reminderEmailEnabled: remoteTask.reminderEmailEnabled,
      reminderOffsets: remoteTask.reminderOffsets
    });

    const localMatch =
      localByRemoteId.get(remoteTask.remoteId) ??
      localByClientId.get(remoteTask.clientId) ??
      localByFingerprint.get(fingerprint);

    if (localMatch?.id) {
      if (localMatch.syncStatus === 'pending_create' || localMatch.syncStatus === 'pending_update') {
        await todoDB.tasks.update(localMatch.id, {
          remoteId: remoteTask.remoteId,
          clientId: remoteTask.clientId,
          syncError: null
        });
        continue;
      }

      if (localMatch.syncStatus === 'pending_delete') {
        continue;
      }

      await todoDB.tasks.update(localMatch.id, {
        remoteId: remoteTask.remoteId,
        clientId: remoteTask.clientId,
        title: remoteTask.title,
        notes: remoteTask.notes,
        dueAt: remoteTask.dueAt,
        priority: remoteTask.priority,
        done: remoteTask.done,
        reminderEmailEnabled: remoteTask.reminderEmailEnabled,
        reminderOffsets: remoteTask.reminderOffsets,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteTask.createdAt,
        updatedAt: remoteTask.updatedAt
      });
      continue;
    }

    await todoDB.tasks.add({
      remoteId: remoteTask.remoteId,
      clientId: remoteTask.clientId,
      title: remoteTask.title,
      notes: remoteTask.notes,
      dueAt: remoteTask.dueAt,
      priority: remoteTask.priority,
      done: remoteTask.done,
      reminderEmailEnabled: remoteTask.reminderEmailEnabled,
      reminderOffsets: remoteTask.reminderOffsets,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      syncError: null,
      deletedAt: null,
      createdAt: remoteTask.createdAt,
      updatedAt: remoteTask.updatedAt
    });
  }
}

export async function syncTodoTasksWithBackend(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, message: 'Offline. Local changes queued.' };
  }

  try {
    await syncPendingDeletes();
    await syncPendingUpserts();
    await mergeRemoteTasks();
    return { success: true, message: 'To-Do synced with backend.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'To-Do sync failed.';
    return { success: false, message };
  }
}
