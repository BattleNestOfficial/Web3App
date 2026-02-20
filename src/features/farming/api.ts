import { apiRequest } from '../../lib/apiClient';
import type { FarmingProjectRecord, FarmingTask } from './db';

export { ApiRequestError } from '../../lib/apiClient';

type BackendTask = {
  id: string;
  title: string;
  completed: boolean;
};

type BackendFarmingProject = {
  id: number;
  client_id: string;
  name: string;
  network: string;
  tasks: BackendTask[];
  claim_date: string | null;
  reward_notes: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
};

type BackendResponse<T> = {
  data: T;
};

export type RemoteFarmingProject = {
  remoteId: number;
  clientId: string;
  name: string;
  network: string;
  tasks: FarmingTask[];
  claimAt: number | null;
  rewardNotes: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
};

type FarmingProjectUpsertPayload = {
  clientId: string;
  name: string;
  network: string;
  tasks: FarmingTask[];
  claimDate: string | null;
  rewardNotes: string;
  progress: number;
};

function normalizeTasks(tasks: BackendTask[] | FarmingTask[]) {
  return tasks
    .map((task) => ({
      id: String(task.id ?? '').trim(),
      title: String(task.title ?? '').trim(),
      completed: Boolean(task.completed)
    }))
    .filter((task) => task.id && task.title);
}

function normalizeRemoteProject(input: BackendFarmingProject): RemoteFarmingProject {
  return {
    remoteId: input.id,
    clientId: input.client_id,
    name: input.name,
    network: input.network,
    tasks: normalizeTasks(input.tasks),
    claimAt: input.claim_date ? new Date(input.claim_date).getTime() : null,
    rewardNotes: input.reward_notes ?? '',
    progress: input.progress,
    createdAt: new Date(input.created_at).getTime(),
    updatedAt: new Date(input.updated_at).getTime()
  };
}

export async function fetchRemoteProjects() {
  const response = await apiRequest<BackendResponse<BackendFarmingProject[]>>('/farming', undefined, { retries: 1 });
  return response.data.map(normalizeRemoteProject);
}

export async function createRemoteProject(payload: FarmingProjectUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendFarmingProject>>(
    '/farming',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteProject(response.data);
}

export async function updateRemoteProject(remoteId: number, payload: FarmingProjectUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendFarmingProject>>(
    `/farming/${remoteId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteProject(response.data);
}

export async function deleteRemoteProject(remoteId: number) {
  await apiRequest<void>(`/farming/${remoteId}`, { method: 'DELETE' }, { retries: 1 });
}

export function toProjectPayload(project: FarmingProjectRecord): FarmingProjectUpsertPayload {
  const tasks = normalizeTasks(project.tasks);
  return {
    clientId: project.clientId,
    name: project.name,
    network: project.network,
    tasks,
    claimDate: project.claimAt ? new Date(project.claimAt).toISOString() : null,
    rewardNotes: project.rewardNotes,
    progress: project.progress
  };
}
