import { apiRequest } from '../../lib/apiClient';
import type { MintRecord, MintVisibility } from './db';

export { ApiRequestError } from '../../lib/apiClient';

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

export async function fetchRemoteMints() {
  const response = await apiRequest<BackendResponse<BackendMint[]>>('/mints', undefined, { retries: 1 });
  return response.data.map(normalizeRemoteMint);
}

export async function createRemoteMint(payload: MintUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendMint>>(
    '/mints',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteMint(response.data);
}

export async function updateRemoteMint(remoteId: number, payload: MintUpsertPayload) {
  const response = await apiRequest<BackendResponse<BackendMint>>(
    `/mints/${remoteId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return normalizeRemoteMint(response.data);
}

export async function deleteRemoteMint(remoteId: number) {
  await apiRequest<void>(`/mints/${remoteId}`, { method: 'DELETE' }, { retries: 1 });
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
