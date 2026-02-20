import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, Circle, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  createTodoTask,
  deleteTodoTask,
  todoDB,
  toggleTodoTask,
  type TodoPriority,
  type TodoTaskDraft,
  type TodoTaskRecord,
  updateTodoTask
} from '../features/todo/db';

type Filter = 'all' | 'active' | 'completed' | 'overdue';

type FormState = {
  title: string;
  notes: string;
  dueDate: string;
  priority: TodoPriority;
};

const defaultForm: FormState = {
  title: '',
  notes: '',
  dueDate: '',
  priority: 'medium'
};

export function TodoPage() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const now = Date.now();

  const tasks = useLiveQuery(
    async () =>
      (await todoDB.tasks.toArray()).sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return b.updatedAt - a.updatedAt;
      }),
    []
  );

  const allTasks = tasks ?? [];
  const filteredTasks = useMemo(() => {
    if (activeFilter === 'active') return allTasks.filter((task) => !task.done);
    if (activeFilter === 'completed') return allTasks.filter((task) => task.done);
    if (activeFilter === 'overdue') return allTasks.filter((task) => !task.done && task.dueAt !== null && task.dueAt < now);
    return allTasks;
  }, [activeFilter, allTasks, now]);

  const stats = useMemo(() => {
    const total = allTasks.length;
    const done = allTasks.filter((task) => task.done).length;
    const active = total - done;
    const overdue = allTasks.filter((task) => !task.done && task.dueAt !== null && task.dueAt < now).length;
    const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, active, overdue, completionRate };
  }, [allTasks, now]);

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorText('');

    try {
      const draft: TodoTaskDraft = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        dueAt: form.dueDate ? new Date(form.dueDate).getTime() : null,
        priority: form.priority
      };

      if (!draft.title) {
        throw new Error('Task title is required.');
      }

      if (editingId === null) {
        await createTodoTask(draft);
      } else {
        await updateTodoTask(editingId, draft);
      }

      setForm(defaultForm);
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save task.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(task: TodoTaskRecord) {
    if (!task.id) return;
    setEditingId(task.id);
    setForm({
      title: task.title,
      notes: task.notes,
      dueDate: task.dueAt ? toDateTimeLocal(task.dueAt) : '',
      priority: task.priority
    });
  }

  async function removeTask(taskId?: number) {
    if (!taskId) return;
    if (!window.confirm('Delete this to-do task?')) return;
    await deleteTodoTask(taskId);

    if (editingId === taskId) {
      setEditingId(null);
      setForm(defaultForm);
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">To-Do</p>
        <h2 className="text-gradient mt-1 font-display text-2xl sm:text-3xl">Personal Task Console</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.6fr]">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          onSubmit={submitTask}
          className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_25px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6"
        >
          <div className="mb-5 flex items-center gap-2">
            <Plus className="h-4 w-4 text-glow" />
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit To-Do' : 'Create To-Do'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Task title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />

            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Notes (optional)"
              rows={4}
              className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
            />

            <Input
              type="datetime-local"
              value={form.dueDate}
              onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
            />

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Priority</span>
              <select
                value={form.priority}
                onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as TodoPriority }))}
                className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            {errorText ? <p className="text-sm text-danger">{errorText}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Task' : 'Add Task'}
              </Button>
              {editingId !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setForm(defaultForm);
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
            <div className="mb-3 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-glow" />
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Overview</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <StatTile label="Total" value={stats.total} />
              <StatTile label="Active" value={stats.active} />
              <StatTile label="Done" value={stats.done} />
              <StatTile label="Overdue" value={stats.overdue} danger />
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>Completion</span>
                <span>{stats.completionRate}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <motion.div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.completionRate}%` }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {(['all', 'active', 'completed', 'overdue'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                    activeFilter === filter
                      ? 'border-glow/60 bg-glow/10 text-white'
                      : 'border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <AnimatePresence mode="popLayout">
              {filteredTasks.length === 0 ? (
                <motion.article
                  key="todo-empty-state"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No tasks for this filter.</p>
                </motion.article>
              ) : (
                filteredTasks.map((task, index) => (
                  <motion.article
                    key={task.id ?? `${task.title}-${index}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, delay: index * 0.02 }}
                    className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => task.id && void toggleTodoTask(task.id, !task.done)}
                        className="mt-0.5 inline-flex h-5 w-5 items-center justify-center text-slate-300"
                        aria-label={task.done ? 'Mark active' : 'Mark done'}
                      >
                        {task.done ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <Circle className="h-5 w-5" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <h3 className={`text-sm font-medium ${task.done ? 'text-slate-500 line-through' : 'text-white'}`}>{task.title}</h3>
                        {task.notes ? <p className="mt-1 text-xs text-slate-400">{task.notes}</p> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${priorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                            {task.done ? 'completed' : 'active'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <CalendarClock className="h-3.5 w-3.5 text-glow" />
                        <span>{formatDue(task.dueAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button type="button" variant="secondary" className="px-3" onClick={() => beginEdit(task)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" className="px-3" onClick={() => void removeTask(task.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </motion.article>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-lg ${danger ? 'text-rose-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDue(dueAt: number | null) {
  if (!dueAt) return 'No due date';
  return new Date(dueAt).toLocaleString();
}

function priorityBadge(priority: TodoPriority) {
  if (priority === 'high') return 'border border-rose-300/40 bg-rose-300/10 text-rose-200';
  if (priority === 'medium') return 'border border-amber-300/40 bg-amber-300/10 text-amber-200';
  return 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
}
