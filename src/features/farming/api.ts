import { auth } from '../../lib/firebase';
import type { FarmingProjectRecord, FarmingTask } from './db';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

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

export class ApiRequestError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

function normalizeTasks(tasks: BackendTask[] | FarmingTask[]) {
  return tasks
    .map((task) => ({
      id: String(task.id ?? '').trim(),
      title: String(task.title ?? '').trim(),
      completed: Boolean(task.completed)
    }))
    .filter((task) => task.id && task.title);
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiRequestError('Authentication required to sync farming projects.', 401);
  }
  return user.getIdToken();
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiRequestError('You are offline.', 0);
  }

  const token = await getAuthToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {})
      }
    });
  } catch {
    throw new ApiRequestError('Network error while contacting backend.', 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Ignore JSON parsing errors for non-JSON responses.
    }
    throw new ApiRequestError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function fetchRemoteProjects() {
  const response = await request<BackendResponse<BackendFarmingProject[]>>('/farming');
  return response.data.map(normalizeRemoteProject);
}

export async function createRemoteProject(payload: FarmingProjectUpsertPayload) {
  const response = await request<BackendResponse<BackendFarmingProject>>('/farming', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return normalizeRemoteProject(response.data);
}

export async function updateRemoteProject(remoteId: number, payload: FarmingProjectUpsertPayload) {
  const response = await request<BackendResponse<BackendFarmingProject>>(`/farming/${remoteId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return normalizeRemoteProject(response.data);
}

export async function deleteRemoteProject(remoteId: number) {
  await request<void>(`/farming/${remoteId}`, {
    method: 'DELETE'
  });
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
