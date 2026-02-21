import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { Bug, MessageSquareText, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { type DragEvent, type FormEvent, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  bugDB,
  createBug,
  deleteBug,
  type BugDraft,
  type BugHistoryEntry,
  type BugPriority,
  type BugRecord,
  type BugStatus,
  setBugStatus,
  updateBug
} from '../features/bugs/db';
import { formatDateTime, toRelativeTime } from '../features/bugs/time';

type FormState = {
  title: string;
  priority: BugPriority;
  status: BugStatus;
  noteText: string;
  screenshots: string[];
};

const defaultFormState: FormState = {
  title: '',
  priority: 'medium',
  status: 'open',
  noteText: '',
  screenshots: []
};

const STATUS_COLUMNS: Array<{ status: BugStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'review', label: 'Review' },
  { status: 'closed', label: 'Closed' },
  { status: 'resolved', label: 'Resolved' }
];

export function BugTrackerPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [draggingBugId, setDraggingBugId] = useState<number | null>(null);
  const [selectedTimelineBugId, setSelectedTimelineBugId] = useState<number | null>(null);

  const bugs = useLiveQuery(async () => (await bugDB.bugs.toArray()).sort((a, b) => b.updatedAt - a.updatedAt), []);
  const allBugs = useMemo(() => bugs ?? [], [bugs]);

  const counters = useMemo(() => {
    return {
      open: allBugs.filter((bug) => bug.status === 'open').length,
      review: allBugs.filter((bug) => bug.status === 'review').length,
      closed: allBugs.filter((bug) => bug.status === 'closed').length,
      resolved: allBugs.filter((bug) => bug.status === 'resolved').length
    };
  }, [allBugs]);

  const timelineEvents = useMemo(() => {
    const events: Array<{
      bugId: number;
      title: string;
      priority: BugPriority;
      status: BugStatus;
      event: BugHistoryEntry;
    }> = [];

    for (const bug of allBugs) {
      if (!bug.id) continue;
      for (const event of bug.history) {
        events.push({
          bugId: bug.id,
          title: bug.title,
          priority: bug.priority,
          status: bug.status,
          event
        });
      }
    }

    return events
      .filter((event) => (selectedTimelineBugId ? event.bugId === selectedTimelineBugId : true))
      .sort((a, b) => b.event.at - a.event.at)
      .slice(0, 30);
  }, [allBugs, selectedTimelineBugId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorText('');

    try {
      const draft: BugDraft = {
        title: form.title.trim(),
        priority: form.priority,
        status: form.status,
        noteText: form.noteText.trim(),
        screenshots: form.screenshots
      };

      if (!draft.title) {
        throw new Error('Bug title is required.');
      }

      if (editingId === null) {
        await createBug(draft);
      } else {
        await updateBug(editingId, draft);
      }

      setForm(defaultFormState);
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save bug right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(bug: BugRecord) {
    if (!bug.id) return;
    setEditingId(bug.id);
    setErrorText('');
    setForm({
      title: bug.title,
      priority: bug.priority,
      status: bug.status,
      noteText: '',
      screenshots: bug.screenshots
    });
  }

  async function removeBug(id?: number) {
    if (!id) return;
    if (!window.confirm('Delete this bug?')) return;
    await deleteBug(id);

    if (editingId === id) {
      setEditingId(null);
      setForm(defaultFormState);
    }

    if (selectedTimelineBugId === id) {
      setSelectedTimelineBugId(null);
    }
  }

  async function onDropStatus(status: BugStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const rawId = event.dataTransfer.getData('text/plain');
    const parsed = Number.parseInt(rawId, 10);
    const bugId = Number.isInteger(parsed) ? parsed : draggingBugId;
    if (!bugId) return;

    await setBugStatus(bugId, status);
    setDraggingBugId(null);

    if (editingId === bugId) {
      setForm((prev) => ({ ...prev, status }));
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Quality</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Bug Tracker</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr]">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2">
            <Plus className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit Bug' : 'Report Bug'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Bug title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as BugPriority }))}
                  className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as BugStatus }))}
                  className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
                >
                  <option value="open">Open</option>
                  <option value="review">Review</option>
                  <option value="closed">Closed</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
            </div>

            <textarea
              placeholder={editingId ? 'Add update note (optional)' : 'Initial notes (optional)'}
              value={form.noteText}
              onChange={(event) => setForm((prev) => ({ ...prev, noteText: event.target.value }))}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
            />

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Bug' : 'Create Bug'}
              </Button>
              {editingId !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(defaultFormState);
                    setErrorText('');
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        </motion.form>

        <div className="space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <p>
                Open: <span className="font-semibold text-white">{counters.open}</span>
              </p>
              <p>
                Review: <span className="font-semibold text-white">{counters.review}</span>
              </p>
              <p>
                Closed: <span className="font-semibold text-white">{counters.closed}</span>
              </p>
              <p>
                Resolved: <span className="font-semibold text-white">{counters.resolved}</span>
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-glow" />
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Timeline History</p>
              </div>
              <select
                value={selectedTimelineBugId ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedTimelineBugId(value ? Number(value) : null);
                }}
                className="rounded-lg border border-slate-700 bg-panelAlt px-2 py-1.5 text-xs text-white focus:border-glow/70 focus:outline-none"
              >
                <option value="">All Bugs</option>
                {allBugs.map((bug) =>
                  bug.id ? (
                    <option key={`timeline-filter-${bug.id}`} value={bug.id}>
                      #{bug.id} {bug.title}
                    </option>
                  ) : null
                )}
              </select>
            </div>

            <AnimatePresence mode="popLayout">
              {timelineEvents.length === 0 ? (
                <motion.article
                  key="empty-bug-timeline"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No timeline history yet.</p>
                </motion.article>
              ) : (
                timelineEvents.map((entry, index) => (
                  <motion.article
                    key={`${entry.event.id}-${entry.bugId}`}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, delay: index * 0.02 }}
                    className="mb-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-white">
                        #{entry.bugId} {entry.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {toRelativeTime(entry.event.at)} ({formatDateTime(entry.event.at)})
                      </p>
                    </div>
                    <p className="text-sm text-slate-300">{entry.event.message}</p>
                  </motion.article>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <Bug className="h-4 w-4 text-glow" />
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Kanban Board</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_COLUMNS.map((column) => {
            const columnBugs = allBugs.filter((bug) => bug.status === column.status);
            return (
              <div
                key={column.status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void onDropStatus(column.status, event)}
                className="min-h-44 rounded-2xl border border-slate-700/70 bg-panel/75 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{column.label}</p>
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300">
                    {columnBugs.length}
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  {columnBugs.length === 0 ? (
                    <motion.p
                      key={`${column.status}-empty`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500"
                    >
                      Drop bug here
                    </motion.p>
                  ) : (
                    columnBugs.map((bug, index) => (
                      <motion.article
                        layout
                        draggable
                        onDragStartCapture={(event) => {
                          if (bug.id) {
                            event.dataTransfer.setData('text/plain', String(bug.id));
                            setDraggingBugId(bug.id);
                          }
                        }}
                        onDragEndCapture={() => setDraggingBugId(null)}
                        key={`${column.status}-${bug.id ?? index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, delay: index * 0.02 }}
                        className="mb-2 cursor-grab rounded-xl border border-white/10 bg-white/[0.03] p-3 active:cursor-grabbing"
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-sm text-white">{bug.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${priorityBadge(bug.priority)}`}>
                            {bug.priority}
                          </span>
                        </div>

                        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                          <span>{bug.notes.length} note(s)</span>
                          <span>{bug.screenshots.length} screenshot(s)</span>
                        </div>

                        {bug.notes.length > 0 ? (
                          <p className="mb-2 line-clamp-2 text-xs text-slate-300">{bug.notes[bug.notes.length - 1].text}</p>
                        ) : null}

                        {bug.screenshots.length > 0 ? (
                          <div className="mb-2 grid grid-cols-3 gap-1">
                            {bug.screenshots.slice(0, 3).map((image, imageIndex) => (
                              <img
                                key={`${bug.id}-image-${imageIndex}`}
                                src={image}
                                alt={`Bug screenshot ${imageIndex + 1}`}
                                className="h-10 w-full rounded border border-white/10 object-cover"
                              />
                            ))}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button type="button" variant="secondary" className="px-2 py-1 text-xs" onClick={() => startEdit(bug)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => removeBug(bug.id)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              if (bug.id) setSelectedTimelineBugId(bug.id);
                            }}
                            className="ml-auto inline-flex items-center rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                          >
                            <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                            History
                          </button>
                        </div>
                      </motion.article>
                    ))
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function priorityBadge(priority: BugPriority) {
  if (priority === 'critical') return 'border border-rose-400/50 bg-rose-400/15 text-rose-200';
  if (priority === 'high') return 'border border-orange-300/50 bg-orange-300/15 text-orange-200';
  if (priority === 'medium') return 'border border-amber-300/40 bg-amber-300/10 text-amber-200';
  return 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
}
