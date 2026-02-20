import Dexie, { type Table } from 'dexie';

export type BugStatus = 'open' | 'review' | 'closed' | 'resolved';
export type BugPriority = 'low' | 'medium' | 'high' | 'critical';
export type BugHistoryType = 'created' | 'updated' | 'status' | 'note' | 'attachment' | 'deleted';

export type BugNote = {
  id: string;
  text: string;
  createdAt: number;
};

export type BugHistoryEntry = {
  id: string;
  at: number;
  type: BugHistoryType;
  message: string;
};

export type BugRecord = {
  id?: number;
  title: string;
  priority: BugPriority;
  status: BugStatus;
  notes: BugNote[];
  screenshots: string[];
  history: BugHistoryEntry[];
  createdAt: number;
  updatedAt: number;
};

export type BugDraft = {
  title: string;
  priority: BugPriority;
  status: BugStatus;
  noteText: string;
  screenshots: string[];
};

class BugTrackerDatabase extends Dexie {
  bugs!: Table<BugRecord, number>;

  constructor() {
    super('bug-tracker-db');

    this.version(1).stores({
      bugs: '++id,status,priority,createdAt,updatedAt'
    });
  }
}

export const bugDB = new BugTrackerDatabase();

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createHistory(type: BugHistoryType, message: string, at = Date.now()): BugHistoryEntry {
  return {
    id: createId('history'),
    at,
    type,
    message
  };
}

function normalizeScreenshots(images: string[]) {
  const unique = new Set<string>();
  const normalized: string[] = [];
  for (const image of images) {
    if (!image || unique.has(image)) continue;
    unique.add(image);
    normalized.push(image);
  }
  return normalized.slice(0, 10);
}

export async function createBug(draft: BugDraft) {
  const now = Date.now();
  const notes: BugNote[] = [];
  const history: BugHistoryEntry[] = [createHistory('created', 'Bug created.', now)];

  const noteText = draft.noteText.trim();
  if (noteText) {
    notes.push({
      id: createId('note'),
      text: noteText,
      createdAt: now
    });
    history.push(createHistory('note', 'Initial note added.', now));
  }

  const screenshots = normalizeScreenshots(draft.screenshots);
  if (screenshots.length > 0) {
    history.push(createHistory('attachment', `${screenshots.length} screenshot(s) attached.`, now));
  }

  await bugDB.bugs.add({
    title: draft.title.trim(),
    priority: draft.priority,
    status: draft.status,
    notes,
    screenshots,
    history,
    createdAt: now,
    updatedAt: now
  });
}

export async function updateBug(id: number, draft: BugDraft) {
  const existing = await bugDB.bugs.get(id);
  if (!existing) return;

  const now = Date.now();
  const history = [...existing.history];
  const notes = [...existing.notes];
  const screenshots = normalizeScreenshots(draft.screenshots);
  const title = draft.title.trim();

  if (title !== existing.title) {
    history.push(createHistory('updated', `Title changed to "${title}".`, now));
  }

  if (draft.priority !== existing.priority) {
    history.push(createHistory('updated', `Priority changed to ${draft.priority}.`, now));
  }

  if (draft.status !== existing.status) {
    history.push(createHistory('status', `Status moved from ${existing.status} to ${draft.status}.`, now));
  }

  const noteText = draft.noteText.trim();
  if (noteText) {
    notes.push({
      id: createId('note'),
      text: noteText,
      createdAt: now
    });
    history.push(createHistory('note', 'New note added.', now));
  }

  if (screenshots.length !== existing.screenshots.length) {
    history.push(createHistory('attachment', 'Screenshot attachments updated.', now));
  }

  await bugDB.bugs.update(id, {
    title,
    priority: draft.priority,
    status: draft.status,
    notes,
    screenshots,
    history,
    updatedAt: now
  });
}

export async function setBugStatus(id: number, status: BugStatus) {
  const existing = await bugDB.bugs.get(id);
  if (!existing || existing.status === status) return;

  const now = Date.now();
  await bugDB.bugs.update(id, {
    status,
    history: [...existing.history, createHistory('status', `Status moved from ${existing.status} to ${status}.`, now)],
    updatedAt: now
  });
}

export async function deleteBug(id: number) {
  const existing = await bugDB.bugs.get(id);
  if (!existing) return;

  const now = Date.now();
  await bugDB.bugs.update(id, {
    history: [...existing.history, createHistory('deleted', 'Bug deleted.', now)],
    updatedAt: now
  });
  await bugDB.bugs.delete(id);
}
