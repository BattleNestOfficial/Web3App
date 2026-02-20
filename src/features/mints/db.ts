import Dexie, { type Table } from 'dexie';
import { recordAppActivity } from '../activity/log';

export type MintVisibility = 'whitelist' | 'public';
export type ReminderOffsetMinutes = 60 | 30 | 10;
export type MintSyncStatus =
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete'
  | 'synced'
  | 'error';

export const REMINDER_OPTIONS: Array<{ label: string; minutes: ReminderOffsetMinutes }> = [
  { label: '1h before', minutes: 60 },
  { label: '30m before', minutes: 30 },
  { label: '10m before', minutes: 10 }
];

export type MintRecord = {
  id?: number;
  remoteId: number | null;
  clientId: string;
  name: string;
  chain: string;
  mintAt: number;
  visibility: MintVisibility;
  link: string;
  notes: string;
  syncStatus: MintSyncStatus;
  lastSyncedAt: number | null;
  syncError: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type MintDraft = {
  name: string;
  chain: string;
  mintAt: number;
  visibility: MintVisibility;
  link: string;
  notes: string;
  reminderOffsets: ReminderOffsetMinutes[];
};

export type ReminderRecord = {
  id?: number;
  mintId: number;
  remindAt: number;
  offsetMinutes: ReminderOffsetMinutes;
  triggeredAt: number | null;
  createdAt: number;
  updatedAt: number;
};

class MintTrackerDatabase extends Dexie {
  mints!: Table<MintRecord, number>;
  reminders!: Table<ReminderRecord, number>;

  constructor() {
    super('mint-tracker-db');

    this.version(1).stores({
      mints: '++id,mintAt,visibility,chain,createdAt,updatedAt'
    });

    this.version(2).stores({
      mints: '++id,mintAt,visibility,chain,createdAt,updatedAt',
      reminders: '++id,mintId,remindAt,offsetMinutes,triggeredAt,createdAt,updatedAt'
    });

    this.version(3)
      .stores({
        mints: '++id,remoteId,clientId,syncStatus,mintAt,visibility,chain,deletedAt,createdAt,updatedAt',
        reminders: '++id,mintId,remindAt,offsetMinutes,triggeredAt,createdAt,updatedAt'
      })
      .upgrade(async (tx) => {
        const mints = tx.table('mints');
        let index = 0;
        await mints.toCollection().modify((mint) => {
          index += 1;
          const now = Date.now();
          mint.remoteId = mint.remoteId ?? null;
          mint.clientId = mint.clientId ?? `legacy-${now}-${index}`;
          mint.syncStatus = mint.syncStatus ?? 'pending_create';
          mint.lastSyncedAt = mint.lastSyncedAt ?? null;
          mint.syncError = mint.syncError ?? null;
          mint.deletedAt = mint.deletedAt ?? null;
        });
      });
  }
}

export const mintDB = new MintTrackerDatabase();

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mint-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function buildReminderRecords(
  mintId: number,
  mintAt: number,
  offsets: ReminderOffsetMinutes[],
  now: number
) {
  const uniqueOffsets = Array.from(new Set(offsets));
  return uniqueOffsets.map((offsetMinutes) => ({
    mintId,
    remindAt: mintAt - offsetMinutes * 60 * 1000,
    offsetMinutes,
    triggeredAt: null,
    createdAt: now,
    updatedAt: now
  }));
}

export async function createMint(draft: MintDraft) {
  const now = Date.now();
  const mintName = draft.name.trim() || 'Untitled mint';
  const chain = draft.chain.trim() || 'Unknown chain';
  const reminderCount = new Set(draft.reminderOffsets).size;
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    const mintId = await mintDB.mints.add({
      remoteId: null,
      clientId: createClientId(),
      name: draft.name,
      chain: draft.chain,
      mintAt: draft.mintAt,
      visibility: draft.visibility,
      link: draft.link,
      notes: draft.notes,
      syncStatus: 'pending_create',
      lastSyncedAt: null,
      syncError: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    });

    const reminders = buildReminderRecords(mintId, draft.mintAt, draft.reminderOffsets, now);
    if (reminders.length > 0) {
      await mintDB.reminders.bulkAdd(reminders);
    }
  });

  await recordAppActivity({
    source: 'mint_tracker',
    action: 'create_mint',
    title: 'Mint added',
    detail: `${mintName} | ${chain} | ${draft.visibility} | reminders ${reminderCount}`,
    happenedAt: now
  });
}

export async function updateMint(id: number, draft: MintDraft) {
  const now = Date.now();
  const mintName = draft.name.trim() || 'Untitled mint';
  const chain = draft.chain.trim() || 'Unknown chain';
  let updated = false;
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    const existing = await mintDB.mints.get(id);
    if (!existing) return;

    await mintDB.mints.update(id, {
      name: draft.name,
      chain: draft.chain,
      mintAt: draft.mintAt,
      visibility: draft.visibility,
      link: draft.link,
      notes: draft.notes,
      syncStatus: existing.remoteId ? 'pending_update' : 'pending_create',
      syncError: null,
      deletedAt: null,
      updatedAt: now
    });

    await mintDB.reminders.where('mintId').equals(id).delete();
    const reminders = buildReminderRecords(id, draft.mintAt, draft.reminderOffsets, now);
    if (reminders.length > 0) {
      await mintDB.reminders.bulkAdd(reminders);
    }
    updated = true;
  });

  if (!updated) return;
  await recordAppActivity({
    source: 'mint_tracker',
    action: 'update_mint',
    title: 'Mint updated',
    detail: `${mintName} | ${chain} | ${draft.visibility}`,
    happenedAt: now
  });
}

export async function removeMint(id: number) {
  let removedMintName = '';
  let pendingRemoteDelete = false;
  const now = Date.now();
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    const existing = await mintDB.mints.get(id);
    if (!existing) return;
    removedMintName = existing.name.trim() || 'Untitled mint';

    await mintDB.reminders.where('mintId').equals(id).delete();

    if (existing.remoteId) {
      await mintDB.mints.update(id, {
        syncStatus: 'pending_delete',
        syncError: null,
        deletedAt: Date.now(),
        updatedAt: Date.now()
      });
      pendingRemoteDelete = true;
      return;
    }

    await mintDB.mints.delete(id);
  });

  if (!removedMintName) return;
  await recordAppActivity({
    source: 'mint_tracker',
    action: 'remove_mint',
    title: pendingRemoteDelete ? 'Mint scheduled for deletion' : 'Mint removed',
    detail: removedMintName,
    happenedAt: now
  });
}
