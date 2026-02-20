import { auth } from '../../lib/firebase';
import type { MintRecord, MintVisibility } from './db';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

type BackendMint = {
  id: number;
  client_id: string;
  name: string;
  chain: string;
  mint_date: string;
  visibility: MintVisibility;
  link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type BackendResponse<T> = {
  data: T;
};

export type RemoteMint = {
  remoteId: number;
  clientId: string;
  name: string;
  chain: string;
  mintAt: number;
  visibility: MintVisibility;
  link: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
};

type MintUpsertPayload = {
  clientId: string;
  name: string;
  chain: string;
  mintDate: string;
  visibility: MintVisibility;
  link: string;
  notes: string;
  reminderOffsets: number[];
};

export class ApiRequestError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiRequestError('Authentication required to sync mints.', 401);
  }
  return user.getIdToken();
}

function normalizeRemoteMint(input: BackendMint): RemoteMint {
  return {
    remoteId: input.id,
    clientId: input.client_id,
    name: input.name,
    chain: input.chain,
    mintAt: new Date(input.mint_date).getTime(),
    visibility: input.visibility,
    link: input.link ?? '',
    notes: input.notes ?? '',
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

export async function fetchRemoteMints() {
  const response = await request<BackendResponse<BackendMint[]>>('/mints');
  return response.data.map(normalizeRemoteMint);
}

export async function createRemoteMint(payload: MintUpsertPayload) {
  const response = await request<BackendResponse<BackendMint>>('/mints', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return normalizeRemoteMint(response.data);
}

export async function updateRemoteMint(remoteId: number, payload: MintUpsertPayload) {
  const response = await request<BackendResponse<BackendMint>>(`/mints/${remoteId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  return normalizeRemoteMint(response.data);
}

export async function deleteRemoteMint(remoteId: number) {
  await request<void>(`/mints/${remoteId}`, {
    method: 'DELETE'
  });
}

export function toMintPayload(mint: MintRecord, reminderOffsets: number[]): MintUpsertPayload {
  return {
    clientId: mint.clientId,
    name: mint.name,
    chain: mint.chain,
    mintDate: new Date(mint.mintAt).toISOString(),
    visibility: mint.visibility,
    link: mint.link,
    notes: mint.notes,
    reminderOffsets
  };
}
