import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, CheckCircle2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  calculateProgress,
  createProject,
  farmingDB,
  type FarmingProjectDraft,
  type FarmingProjectRecord,
  type FarmingProjectSyncStatus,
  type FarmingTask,
  removeProject,
  updateProject
} from '../features/farming/db';
import { syncProjectsWithBackend } from '../features/farming/sync';
import { formatCountdown, formatDateTime, parseOptionalDateInput, toDateTimeLocalValue } from '../features/farming/time';
import { useNow } from '../features/mints/useNow';

type FormState = {
  name: string;
  network: string;
  claimDate: string;
  rewardNotes: string;
  tasks: FarmingTask[];
  taskInput: string;
};

const defaultFormState: FormState = {
  name: '',
  network: '',
  claimDate: '',
  rewardNotes: '',
  tasks: [],
  taskInput: ''
};

export function FarmingTrackerPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('Waiting for first sync...');
  const [errorText, setErrorText] = useState('');
  const now = useNow(1000);

  const projects = useLiveQuery(
    async () =>
      (await farmingDB.projects.toArray())
        .filter((project) => project.deletedAt === null)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    []
  );
  const sortedProjects = useMemo(() => projects ?? [], [projects]);
  const pendingSyncCount = useMemo(
    () => sortedProjects.filter((project) => project.syncStatus !== 'synced').length,
    [sortedProjects]
  );
  const upcomingClaims = useMemo(() => {
    return sortedProjects
      .filter((project) => project.claimAt !== null && project.claimAt >= now)
      .sort((a, b) => (a.claimAt ?? 0) - (b.claimAt ?? 0))
      .slice(0, 6);
  }, [sortedProjects, now]);
  const formProgress = useMemo(() => calculateProgress(form.tasks), [form.tasks]);

  const runSync = useCallback(async () => {
    setIsSyncing(true);
    const result = await syncProjectsWithBackend();
    setSyncMessage(result.message);
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    void runSync();
    const onOnline = () => {
      void runSync();
    };

    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [runSync]);

  function addTaskToForm() {
    const title = form.taskInput.trim();
    if (!title) return;

    const task: FarmingTask = {
      id: `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      title,
      completed: false
    };

    setForm((prev) => ({
      ...prev,
      taskInput: '',
      tasks: [...prev.tasks, task]
    }));
  }

  function removeTaskFromForm(taskId: string) {
    setForm((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== taskId)
    }));
  }

  function toggleFormTask(taskId: string) {
    setForm((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed
            }
          : task
      )
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorText('');
    setIsSubmitting(true);

    try {
      const claimAt = parseOptionalDateInput(form.claimDate);
      const draft: FarmingProjectDraft = {
        name: form.name.trim(),
        network: form.network.trim(),
        tasks: form.tasks,
        claimAt,
        rewardNotes: form.rewardNotes.trim()
      };

      if (!draft.name || !draft.network) {
        throw new Error('Project and network are required.');
      }

      if (editingId === null) {
        await createProject(draft);
      } else {
        await updateProject(editingId, draft);
      }

      void runSync();
      setForm(defaultFormState);
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save project right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function mapProjectToDraft(project: FarmingProjectRecord): FarmingProjectDraft {
    return {
      name: project.name,
      network: project.network,
      tasks: project.tasks,
      claimAt: project.claimAt,
      rewardNotes: project.rewardNotes
    };
  }

  function startEdit(project: FarmingProjectRecord) {
    if (!project.id) return;
    setEditingId(project.id);
    setErrorText('');
    setForm({
      name: project.name,
      network: project.network,
      claimDate: project.claimAt ? toDateTimeLocalValue(project.claimAt) : '',
      rewardNotes: project.rewardNotes,
      tasks: project.tasks,
      taskInput: ''
    });
  }

  async function handleDelete(id?: number) {
    if (!id) return;
    if (!window.confirm('Delete this project/testnet entry?')) return;
    await removeProject(id);
    void runSync();
    if (editingId === id) {
      setEditingId(null);
      setForm(defaultFormState);
    }
  }

  async function toggleProjectTask(project: FarmingProjectRecord, taskId: string) {
    if (!project.id) return;

    const draft = mapProjectToDraft({
      ...project,
      tasks: project.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed
            }
          : task
      )
    });

    await updateProject(project.id, draft);
    void runSync();
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Projects / Testnets</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Projects / Testnets</h2>
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
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit Project' : 'Add Project'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Project name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Input
              placeholder="Network (Ethereum, Solana, Base...)"
              value={form.network}
              onChange={(event) => setForm((prev) => ({ ...prev, network: event.target.value }))}
              required
            />
            <Input
              type="datetime-local"
              value={form.claimDate}
              onChange={(event) => setForm((prev) => ({ ...prev, claimDate: event.target.value }))}
            />

            <div className="space-y-2 rounded-xl border border-slate-700 bg-panelAlt p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Task Checklist</p>

              <div className="flex gap-2">
                <Input
                  placeholder="Add task..."
                  value={form.taskInput}
                  onChange={(event) => setForm((prev) => ({ ...prev, taskInput: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTaskToForm();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addTaskToForm}>
                  Add
                </Button>
              </div>

              {form.tasks.length === 0 ? (
                <p className="text-sm text-slate-400">No tasks added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {form.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-panel px-3 py-2"
                    >
                      <label className="flex min-w-0 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-red-500"
                          checked={task.completed}
                          onChange={() => toggleFormTask(task.id)}
                        />
                        <span className={`truncate text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                          {task.title}
                        </span>
                      </label>

                      <button
                        type="button"
                        className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                        onClick={() => removeTaskFromForm(task.id)}
                        aria-label={`Remove ${task.title}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-panelAlt p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Progress</p>
                <p className="text-sm font-semibold text-white">{formProgress}%</p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  initial={false}
                  animate={{ width: `${formProgress}%` }}
                  transition={{ duration: 0.25 }}
                  className="h-full rounded-full bg-gradient-to-r from-red-500/90 to-rose-500/90"
                />
              </div>
            </div>

            <textarea
              placeholder="Reward notes"
              value={form.rewardNotes}
              onChange={(event) => setForm((prev) => ({ ...prev, rewardNotes: event.target.value }))}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
            />

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Project' : 'Add Project'}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-300">
                Total projects: <span className="font-semibold text-white">{sortedProjects.length}</span>
              </p>
              <p className="text-sm text-slate-300">
                Pending sync: <span className="font-semibold text-white">{pendingSyncCount}</span>
              </p>
              <p className="text-sm text-slate-300">
                Upcoming claim windows: <span className="font-semibold text-white">{upcomingClaims.length}</span>
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">{syncMessage}</p>
              <Button type="button" variant="ghost" className="px-3" onClick={() => void runSync()} disabled={isSyncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync now
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <p className="mb-3 text-xs uppercase tracking-[0.14em] text-slate-400">Upcoming Claims</p>
            {upcomingClaims.length === 0 ? (
              <p className="text-sm text-slate-300">No claim reminders set.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingClaims.map((project) => (
                  <li
                    key={`claim-${project.id ?? project.clientId}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div>
                      <p className="text-sm text-white">{project.name}</p>
                      <p className="text-xs text-slate-400">{project.network}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{project.claimAt ? formatDateTime(project.claimAt) : '-'}</p>
                      <p className="text-sm font-semibold text-glow">
                        {project.claimAt ? formatCountdown(project.claimAt, now) : 'Not set'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AnimatePresence mode="popLayout">
            {sortedProjects.length === 0 ? (
              <motion.article
                key="empty-projects-list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-3xl border border-dashed border-slate-700/80 bg-panel/60 p-6 text-center"
              >
                <p className="text-sm text-slate-300">No project/testnet entries yet. Add one from the form.</p>
              </motion.article>
            ) : (
              sortedProjects.map((project, index) => (
                <ProjectCard
                  key={project.id ?? `${project.clientId}-${index}`}
                  project={project}
                  now={now}
                  index={index}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onToggleTask={toggleProjectTask}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

type ProjectCardProps = {
  project: FarmingProjectRecord;
  now: number;
  index: number;
  onEdit: (project: FarmingProjectRecord) => void;
  onDelete: (id?: number) => Promise<void>;
  onToggleTask: (project: FarmingProjectRecord, taskId: string) => Promise<void>;
};

function ProjectCard({ project, now, index, onEdit, onDelete, onToggleTask }: ProjectCardProps) {
  const claimStatus =
    project.claimAt === null
      ? 'No reminder'
      : project.claimAt <= now
        ? 'Claim now'
        : formatCountdown(project.claimAt, now);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_22px_45px_rgba(0,0,0,0.4)] backdrop-blur-xl"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-white">{project.name}</h3>
          <p className="text-sm text-slate-300">{project.network}</p>
        </div>
        <span className="rounded-full border border-red-300/40 bg-red-300/10 px-2.5 py-1 text-xs uppercase tracking-wide text-red-200">
          {project.progress}% complete
        </span>
      </div>

      {project.syncStatus !== 'synced' ? (
        <div className="mb-3 inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-amber-200">
          {formatSyncStatus(project.syncStatus)}
        </div>
      ) : null}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Progress Bar</p>
          <p className="text-sm font-semibold text-white">{project.progress}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <motion.div
            initial={false}
            animate={{ width: `${project.progress}%` }}
            transition={{ duration: 0.2 }}
            className="h-full rounded-full bg-gradient-to-r from-red-500/90 to-rose-500/90"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Claim Reminder</p>
          <div className="mt-1 flex items-center gap-2">
            <BellRing className="h-4 w-4 text-glow" />
            <p className="text-sm font-semibold text-glow">{claimStatus}</p>
          </div>
          <p className="mt-1 text-xs text-slate-400">{project.claimAt ? formatDateTime(project.claimAt) : 'Not set'}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Tasks</p>
          <p className="mt-1 text-sm text-white">
            {project.tasks.filter((task) => task.completed).length}/{project.tasks.length} completed
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {project.tasks.length === 0 ? (
          <p className="text-sm text-slate-300">No tasks added yet.</p>
        ) : (
          project.tasks.map((task) => (
            <label
              key={`${project.id}-${task.id}`}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-red-500"
                  checked={task.completed}
                  onChange={() => void onToggleTask(project, task.id)}
                />
                <span className={`truncate text-sm ${task.completed ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                  {task.title}
                </span>
              </div>

              {task.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : null}
            </label>
          ))
        )}
      </div>

      {project.rewardNotes ? <p className="mt-3 text-sm text-slate-300">{project.rewardNotes}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3" onClick={() => onEdit(project)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button type="button" variant="ghost" className="px-3" onClick={() => onDelete(project.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>
    </motion.article>
  );
}

function formatSyncStatus(status: FarmingProjectSyncStatus) {
  if (status === 'pending_create') return 'Pending create';
  if (status === 'pending_update') return 'Pending update';
  if (status === 'pending_delete') return 'Pending delete';
  return 'Sync error';
}
