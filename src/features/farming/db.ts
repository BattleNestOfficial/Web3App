import Dexie, { type Table } from 'dexie';
import { recordAppActivity } from '../activity/log';

export type FarmingProjectSyncStatus =
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete'
  | 'synced'
  | 'error';

export type FarmingTask = {
  id: string;
  title: string;
  completed: boolean;
};

export type FarmingProjectRecord = {
  id?: number;
  remoteId: number | null;
  clientId: string;
  name: string;
  network: string;
  tasks: FarmingTask[];
  claimAt: number | null;
  rewardNotes: string;
  progress: number;
  syncStatus: FarmingProjectSyncStatus;
  lastSyncedAt: number | null;
  syncError: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type FarmingProjectDraft = {
  name: string;
  network: string;
  tasks: FarmingTask[];
  claimAt: number | null;
  rewardNotes: string;
};

class FarmingTrackerDatabase extends Dexie {
  projects!: Table<FarmingProjectRecord, number>;

  constructor() {
    super('farming-tracker-db');

    this.version(1).stores({
      projects: '++id,remoteId,clientId,syncStatus,claimAt,deletedAt,createdAt,updatedAt'
    });
  }
}

export const farmingDB = new FarmingTrackerDatabase();

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `farm-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeTasks(tasks: FarmingTask[]) {
  const seen = new Set<string>();
  const normalized: FarmingTask[] = [];

  for (const task of tasks) {
    const title = task.title.trim();
    if (!title) continue;

    const id = (task.id || createTaskId()).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    normalized.push({
      id,
      title,
      completed: Boolean(task.completed)
    });
  }

  return normalized;
}

export function calculateProgress(tasks: FarmingTask[]) {
  if (tasks.length === 0) return 0;
  const completedCount = tasks.filter((task) => task.completed).length;
  return Math.round((completedCount / tasks.length) * 100);
}

export async function createProject(draft: FarmingProjectDraft) {
  const now = Date.now();
  const tasks = normalizeTasks(draft.tasks);
  const name = draft.name.trim() || 'Untitled project';
  const network = draft.network.trim() || 'Unknown network';
  await farmingDB.projects.add({
    remoteId: null,
    clientId: createClientId(),
    name: draft.name.trim(),
    network: draft.network.trim(),
    tasks,
    claimAt: draft.claimAt,
    rewardNotes: draft.rewardNotes.trim(),
    progress: calculateProgress(tasks),
    syncStatus: 'pending_create',
    lastSyncedAt: null,
    syncError: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now
  });

  await recordAppActivity({
    source: 'farming',
    action: 'create_project',
    title: 'Farming project added',
    detail: `${name} | ${network} | tasks ${tasks.length}`,
    happenedAt: now
  });
}

export async function updateProject(id: number, draft: FarmingProjectDraft) {
  const existing = await farmingDB.projects.get(id);
  if (!existing) return;

  const tasks = normalizeTasks(draft.tasks);
  const now = Date.now();
  const name = draft.name.trim() || 'Untitled project';
  const network = draft.network.trim() || 'Unknown network';

  await farmingDB.projects.update(id, {
    name: draft.name.trim(),
    network: draft.network.trim(),
    tasks,
    claimAt: draft.claimAt,
    rewardNotes: draft.rewardNotes.trim(),
    progress: calculateProgress(tasks),
    syncStatus: existing.remoteId ? 'pending_update' : 'pending_create',
    syncError: null,
    deletedAt: null,
    updatedAt: now
  });

  await recordAppActivity({
    source: 'farming',
    action: 'update_project',
    title: 'Farming project updated',
    detail: `${name} | ${network} | progress ${calculateProgress(tasks)}%`,
    happenedAt: now
  });
}

export async function removeProject(id: number) {
  const existing = await farmingDB.projects.get(id);
  if (!existing) return;
  const now = Date.now();
  const name = existing.name.trim() || `Project #${id}`;

  if (existing.remoteId) {
    await farmingDB.projects.update(id, {
      syncStatus: 'pending_delete',
      syncError: null,
      deletedAt: now,
      updatedAt: now
    });
    await recordAppActivity({
      source: 'farming',
      action: 'remove_project',
      title: 'Farming project scheduled for deletion',
      detail: name,
      happenedAt: now
    });
    return;
  }

  await farmingDB.projects.delete(id);
  await recordAppActivity({
    source: 'farming',
    action: 'remove_project',
    title: 'Farming project removed',
    detail: name,
    happenedAt: now
  });
}
