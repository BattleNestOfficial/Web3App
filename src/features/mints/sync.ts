import { mintDB, type MintRecord } from './db';
import {
  ApiRequestError,
  createRemoteMint,
  deleteRemoteMint,
  fetchRemoteMints,
  toMintPayload,
  updateRemoteMint
} from './api';

export type SyncResult = {
  success: boolean;
  message: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function mintFingerprint(input: {
  name: string;
  chain: string;
  mintAt: number;
  visibility: string;
  link: string;
  notes: string;
}) {
  return [
    normalize(input.name),
    normalize(input.chain),
    String(input.mintAt),
    input.visibility,
    normalize(input.link),
    normalize(input.notes)
  ].join('|');
}

async function markSyncError(localMintId: number, message: string) {
  const existing = await mintDB.mints.get(localMintId);
  if (!existing) return;

  const fallbackStatus = existing.remoteId ? 'pending_update' : 'pending_create';
  await mintDB.mints.update(localMintId, {
    syncStatus: existing.syncStatus === 'pending_delete' ? 'pending_delete' : fallbackStatus,
    syncError: message,
    updatedAt: Date.now()
  });
}

async function syncPendingDeletes() {
  const pendingDeletes = await mintDB.mints.where('syncStatus').equals('pending_delete').toArray();

  for (const mint of pendingDeletes) {
    if (!mint.id) continue;
    try {
      if (mint.remoteId) {
        await deleteRemoteMint(mint.remoteId);
      }

      await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
        await mintDB.reminders.where('mintId').equals(mint.id as number).delete();
        await mintDB.mints.delete(mint.id as number);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync delete.';
      await markSyncError(mint.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        // For offline/auth/client errors, stop to preserve operation order.
        throw error;
      }
    }
  }
}

async function syncPendingUpserts() {
  const pendingMints = await mintDB.mints
    .filter(
      (mint) =>
        mint.deletedAt === null &&
        (mint.syncStatus === 'pending_create' || mint.syncStatus === 'pending_update' || mint.syncStatus === 'error')
    )
    .toArray();

  for (const mint of pendingMints) {
    if (!mint.id) continue;
    try {
      const reminderRows = await mintDB.reminders.where('mintId').equals(mint.id).toArray();
      const reminderOffsets = Array.from(new Set(reminderRows.map((row) => row.offsetMinutes))).sort(
        (a, b) => b - a
      );
      const payload = toMintPayload(mint, reminderOffsets);
      const remoteMint = mint.remoteId
        ? await updateRemoteMint(mint.remoteId, payload)
        : await createRemoteMint(payload);

      await mintDB.mints.update(mint.id, {
        remoteId: remoteMint.remoteId,
        clientId: remoteMint.clientId,
        name: remoteMint.name,
        chain: remoteMint.chain,
        mintAt: remoteMint.mintAt,
        visibility: remoteMint.visibility,
        link: remoteMint.link,
        notes: remoteMint.notes,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteMint.createdAt,
        updatedAt: remoteMint.updatedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync mint.';
      await markSyncError(mint.id, message);
      if (!(error instanceof ApiRequestError && error.status && error.status >= 500)) {
        throw error;
      }
    }
  }
}

async function mergeRemoteMints() {
  const remoteMints = await fetchRemoteMints();
  const localMints = await mintDB.mints.toArray();

  const localByRemoteId = new Map<number, MintRecord>();
  const localByClientId = new Map<string, MintRecord>();
  const localByFingerprint = new Map<string, MintRecord>();

  for (const localMint of localMints) {
    if (localMint.remoteId) {
      localByRemoteId.set(localMint.remoteId, localMint);
    }

    localByClientId.set(localMint.clientId, localMint);

    if (localMint.deletedAt === null) {
      localByFingerprint.set(
        mintFingerprint({
          name: localMint.name,
          chain: localMint.chain,
          mintAt: localMint.mintAt,
          visibility: localMint.visibility,
          link: localMint.link,
          notes: localMint.notes
        }),
        localMint
      );
    }
  }

  for (const remoteMint of remoteMints) {
    const fingerprint = mintFingerprint({
      name: remoteMint.name,
      chain: remoteMint.chain,
      mintAt: remoteMint.mintAt,
      visibility: remoteMint.visibility,
      link: remoteMint.link,
      notes: remoteMint.notes
    });

    const localMatch =
      localByRemoteId.get(remoteMint.remoteId) ??
      localByClientId.get(remoteMint.clientId) ??
      localByFingerprint.get(fingerprint);

    if (localMatch?.id) {
      if (localMatch.syncStatus === 'pending_create' || localMatch.syncStatus === 'pending_update') {
        await mintDB.mints.update(localMatch.id, {
          remoteId: remoteMint.remoteId,
          clientId: remoteMint.clientId,
          syncError: null
        });
        continue;
      }

      if (localMatch.syncStatus === 'pending_delete') {
        continue;
      }

      await mintDB.mints.update(localMatch.id, {
        remoteId: remoteMint.remoteId,
        clientId: remoteMint.clientId,
        name: remoteMint.name,
        chain: remoteMint.chain,
        mintAt: remoteMint.mintAt,
        visibility: remoteMint.visibility,
        link: remoteMint.link,
        notes: remoteMint.notes,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
        syncError: null,
        deletedAt: null,
        createdAt: remoteMint.createdAt,
        updatedAt: remoteMint.updatedAt
      });
      continue;
    }

    await mintDB.mints.add({
      remoteId: remoteMint.remoteId,
      clientId: remoteMint.clientId,
      name: remoteMint.name,
      chain: remoteMint.chain,
      mintAt: remoteMint.mintAt,
      visibility: remoteMint.visibility,
      link: remoteMint.link,
      notes: remoteMint.notes,
      syncStatus: 'synced',
      lastSyncedAt: Date.now(),
      syncError: null,
      deletedAt: null,
      createdAt: remoteMint.createdAt,
      updatedAt: remoteMint.updatedAt
    });
  }
}

export async function syncMintsWithBackend(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { success: false, message: 'Offline. Local changes queued.' };
  }

  try {
    await syncPendingDeletes();
    await syncPendingUpserts();
    await mergeRemoteMints();
    return { success: true, message: 'Synced with backend.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.';
    return { success: false, message };
  }
}
