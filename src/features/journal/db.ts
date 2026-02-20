import Dexie, { type Table } from 'dexie';

export type JournalEntryRecord = {
  id?: number;
  dateKey: string;
  title: string;
  contentHtml: string;
  tags: string[];
  screenshots: string[];
  createdAt: number;
  updatedAt: number;
};

export type JournalEntryDraft = {
  dateKey: string;
  title: string;
  contentHtml: string;
  tags: string[];
  screenshots: string[];
};

class JournalDatabase extends Dexie {
  entries!: Table<JournalEntryRecord, number>;

  constructor() {
    super('journal-tracker-db');

    this.version(1).stores({
      entries: '++id,dateKey,createdAt,updatedAt'
    });
  }
}

export const journalDB = new JournalDatabase();

export function normalizeTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export async function createJournalEntry(draft: JournalEntryDraft) {
  const now = Date.now();
  await journalDB.entries.add({
    dateKey: draft.dateKey,
    title: draft.title.trim(),
    contentHtml: draft.contentHtml,
    tags: normalizeTags(draft.tags),
    screenshots: draft.screenshots,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateJournalEntry(id: number, draft: JournalEntryDraft) {
  await journalDB.entries.update(id, {
    dateKey: draft.dateKey,
    title: draft.title.trim(),
    contentHtml: draft.contentHtml,
    tags: normalizeTags(draft.tags),
    screenshots: draft.screenshots,
    updatedAt: Date.now()
  });
}

export async function deleteJournalEntry(id: number) {
  await journalDB.entries.delete(id);
}
