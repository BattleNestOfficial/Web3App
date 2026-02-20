import type { FarmingTask, FarmingProjectRecord } from './db';
import { farmingDB } from './db';
import {
  ApiRequestError,
  createRemoteProject,
  deleteRemoteProject,
  fetchRemoteProjects,
  toProjectPayload,
  updateRemoteProject
} from './api';

export type SyncResult = {
  success: boolean;
  message: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function tasksFingerprint(tasks: FarmingTask[]) {
  return tasks
    .map((task) => `${normalize(task.title)}:${task.completed ? '1' : '0'}`)
    .sort()
    .join('|');
}

function projectFingerprint(input: {
  name: string;
  network: string;
  tasks: FarmingTask[];
  claimAt: number | null;
  rewardNotes: string;
  progress: number;
}) {
  return [
    normalize(input.name),
    normalize(input.network),
    tasksFingerprint(input.tasks),
    String(input.claimAt ?? 0),
    normalize(input.rewardNotes),
    String(input.progress)
  ].join('|');
}

async function markSyncError(localProjectId: number, message: string) {
  const existing = await farmingDB.projects.get(localProjectId);
  if (!existing) return;

  const fallbackStatus = existing.remoteId ? 'pending_update' : 'pending_create';
  await farmingDB.projects.update(localProjectId, {
    syncStatus: existing.syncStatus === 'pending_delete' ? 'pending_delete' : fallbackStatus,
    syncError: message,
    updatedAt: Date.now()
  });
}

async function syncPendingDeletes() {
  const pendingDeletes = await farmingDB.projects
    .where('syncStatus')
    .equals('pending_delete')
    .toArray();

  for (const project of pendingDeletes) {
    if (!project.id) continue;
    try {
      if (project.remoteId) {
        await deleteRemoteProject(project.remoteId);
      }
      await farmingDB.projects.delete(project.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync delete.';
      await markSyncError(project.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        throw error;
      }
    }
  }
}

async function syncPendingUpserts() {
  const pendingProjects = await farmingDB.projects
    .filter(
      (project) =>
        project.deletedAt === null &&
        (project.syncStatus === 'pending_create' ||
          project.syncStatus === 'pending_update' ||
          project.syncStatus === 'error')
    )
    .toArray();

  for (const project of pendingProjects) {
    if (!project.id) continue;

    try {
      const payload = toProjectPayload(project);
      const remoteProject = project.remoteId
        ? await updateRemoteProject(project.remoteId, payload)
        : await createRemoteProject(payload);

      await farmingDB.projects.update(project.id, {
        remoteId: remoteProject.remoteId,
        clientId: remoteProject.clientId,
        name: remoteProject.name,
        network: remoteProject.network,
        tasks: remoteProject.tasks,
        claimAt: remoteProject.claimAt,
        rewardNotes: remoteProject.rewardNotes,
        progress: remoteProject.progress,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteProject.createdAt,
        updatedAt: remoteProject.updatedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync project.';
      await markSyncError(project.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        throw error;
      }
    }
  }
}

async function mergeRemoteProjects() {
  const remoteProjects = await fetchRemoteProjects();
  const localProjects = await farmingDB.projects.toArray();

  const localByRemoteId = new Map<number, FarmingProjectRecord>();
  const localByClientId = new Map<string, FarmingProjectRecord>();
  const localByFingerprint = new Map<string, FarmingProjectRecord>();

  for (const localProject of localProjects) {
    if (localProject.remoteId) {
      localByRemoteId.set(localProject.remoteId, localProject);
    }

    localByClientId.set(localProject.clientId, localProject);

    if (localProject.deletedAt === null) {
      localByFingerprint.set(
        projectFingerprint({
          name: localProject.name,
          network: localProject.network,
          tasks: localProject.tasks,
          claimAt: localProject.claimAt,
          rewardNotes: localProject.rewardNotes,
          progress: localProject.progress
        }),
        localProject
      );
    }
  }

  for (const remoteProject of remoteProjects) {
    const fingerprint = projectFingerprint({
      name: remoteProject.name,
      network: remoteProject.network,
      tasks: remoteProject.tasks,
      claimAt: remoteProject.claimAt,
      rewardNotes: remoteProject.rewardNotes,
      progress: remoteProject.progress
    });

    const localMatch =
      localByRemoteId.get(remoteProject.remoteId) ??
      localByClientId.get(remoteProject.clientId) ??
      localByFingerprint.get(fingerprint);

    if (localMatch?.id) {
      if (localMatch.syncStatus === 'pending_create' || localMatch.syncStatus === 'pending_update') {
        await farmingDB.projects.update(localMatch.id, {
          remoteId: remoteProject.remoteId,
          clientId: remoteProject.clientId,
          syncError: null
        });
        continue;
      }

      if (localMatch.syncStatus === 'pending_delete') {
        continue;
      }

      await farmingDB.projects.update(localMatch.id, {
        remoteId: remoteProject.remoteId,
        clientId: remoteProject.clientId,
        name: remoteProject.name,
        network: remoteProject.network,
        tasks: remoteProject.tasks,
        claimAt: remoteProject.claimAt,
        rewardNotes: remoteProject.rewardNotes,
        progress: remoteProject.progress,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteProject.createdAt,
        updatedAt: remoteProject.updatedAt
      });
      continue;
    }

    await farmingDB.projects.add({
      remoteId: remoteProject.remoteId,
      clientId: remoteProject.clientId,
      name: remoteProject.name,
      network: remoteProject.network,
      tasks: remoteProject.tasks,
      claimAt: remoteProject.claimAt,
      rewardNotes: remoteProject.rewardNotes,
      progress: remoteProject.progress,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      syncError: null,
      deletedAt: null,
      createdAt: remoteProject.createdAt,
      updatedAt: remoteProject.updatedAt
    });
  }
}

export async function syncProjectsWithBackend(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, message: 'Offline. Local changes queued.' };
  }

  try {
    await syncPendingDeletes();
    await syncPendingUpserts();
    await mergeRemoteProjects();
    return { success: true, message: 'Synced with backend.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    return { success: false, message };
  }
}
