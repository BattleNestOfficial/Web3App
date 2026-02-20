import Dexie, { type Table } from 'dexie';

export type MintVisibility = 'whitelist' | 'public';
export type ReminderOffsetMinutes = 60 | 30 | 10;

export const REMINDER_OPTIONS: Array<{ label: string; minutes: ReminderOffsetMinutes }> = [
  { label: '1h before', minutes: 60 },
  { label: '30m before', minutes: 30 },
  { label: '10m before', minutes: 10 }
];

export type MintRecord = {
  id?: number;
  name: string;
  chain: string;
  mintAt: number;
  visibility: MintVisibility;
  link: string;
  notes: string;
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
  }
}

export const mintDB = new MintTrackerDatabase();

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
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    const mintId = await mintDB.mints.add({
      name: draft.name,
      chain: draft.chain,
      mintAt: draft.mintAt,
      visibility: draft.visibility,
      link: draft.link,
      notes: draft.notes,
      createdAt: now,
      updatedAt: now
    });

    const reminders = buildReminderRecords(mintId, draft.mintAt, draft.reminderOffsets, now);
    if (reminders.length > 0) {
      await mintDB.reminders.bulkAdd(reminders);
    }
  });
}

export async function updateMint(id: number, draft: MintDraft) {
  const now = Date.now();
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    await mintDB.mints.update(id, {
      name: draft.name,
      chain: draft.chain,
      mintAt: draft.mintAt,
      visibility: draft.visibility,
      link: draft.link,
      notes: draft.notes,
      updatedAt: now
    });

    await mintDB.reminders.where('mintId').equals(id).delete();
    const reminders = buildReminderRecords(id, draft.mintAt, draft.reminderOffsets, now);
    if (reminders.length > 0) {
      await mintDB.reminders.bulkAdd(reminders);
    }
  });
}

export async function removeMint(id: number) {
  await mintDB.transaction('rw', mintDB.mints, mintDB.reminders, async () => {
    await mintDB.reminders.where('mintId').equals(id).delete();
    await mintDB.mints.delete(id);
  });
}
