import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, KanbanSquare, ListChecks, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { type DragEvent, type FormEvent, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  completeTask,
  createTask,
  deleteTask,
  productivityDB,
  type ProductivityTaskDraft,
  type ProductivityTaskRecord,
  type TaskPriority,
  type TaskRecurrence,
  type TaskStatus,
  setTaskStatus,
  updateTask
} from '../features/productivity/db';
import { formatDateTime, formatDueLabel, parseOptionalDateInput, toDateTimeLocalValue } from '../features/productivity/time';
import { useNow } from '../features/mints/useNow';

type FormState = {
  title: string;
  dueDate: string;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  status: TaskStatus;
};

const defaultFormState: FormState = {
  title: '',
  dueDate: '',
  priority: 'medium',
  recurrence: 'none',
  status: 'todo'
};

const KANBAN_COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' }
];

export function ProductivityPage() {
  const [form, setForm] = useState<FormState>(defaultFormState);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const now = useNow(30_000);

  const tasks = useLiveQuery(
    async () =>
      (await productivityDB.tasks.toArray()).sort((a, b) => {
        const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return b.updatedAt - a.updatedAt;
      }),
    []
  );
  const allTasks = useMemo(() => tasks ?? [], [tasks]);

  const taskCounts = useMemo(() => {
    const todo = allTasks.filter((task) => task.status === 'todo').length;
    const inProgress = allTasks.filter((task) => task.status === 'in_progress').length;
    const done = allTasks.filter((task) => task.status === 'done').length;
    return { todo, inProgress, done };
  }, [allTasks]);

  const overdueCount = useMemo(
    () => allTasks.filter((task) => task.dueAt !== null && task.dueAt <= now && task.status !== 'done').length,
    [allTasks, now]
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorText('');

    try {
      const draft: ProductivityTaskDraft = {
        title: form.title.trim(),
        dueAt: parseOptionalDateInput(form.dueDate),
        priority: form.priority,
        recurrence: form.recurrence,
        status: form.status
      };

      if (!draft.title) {
        throw new Error('Task title is required.');
      }

      if (editingId === null) {
        await createTask(draft);
      } else {
        await updateTask(editingId, draft);
      }

      setForm(defaultFormState);
      setEditingId(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Unable to save task right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(task: ProductivityTaskRecord) {
    if (!task.id) return;
    setEditingId(task.id);
    setErrorText('');
    setForm({
      title: task.title,
      dueDate: task.dueAt ? toDateTimeLocalValue(task.dueAt) : '',
      priority: task.priority,
      recurrence: task.recurrence,
      status: task.status
    });
  }

  async function removeTask(taskId?: number) {
    if (!taskId) return;
    if (!window.confirm('Delete this task?')) return;
    await deleteTask(taskId);

    if (editingId === taskId) {
      setEditingId(null);
      setForm(defaultFormState);
    }
  }

  async function handleDropStatus(status: TaskStatus, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const droppedIdRaw = event.dataTransfer.getData('text/plain');
    const fallbackId = draggingTaskId;
    const parsedId = Number.parseInt(droppedIdRaw, 10);
    const taskId = Number.isInteger(parsedId) ? parsedId : fallbackId;
    if (!taskId) return;

    await setTaskStatus(taskId, status);
    setDraggingTaskId(null);
  }

  return (
    <section className="mx-auto max-w-7xl">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Productivity</p>
        <h2 className="mt-1 font-display text-2xl text-white sm:text-3xl">Task Flow</h2>
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
            <h3 className="font-display text-lg text-white">{editingId ? 'Edit Task' : 'Add Task'}</h3>
          </div>

          <div className="space-y-3">
            <Input
              placeholder="Task title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
            />

            <Input
              type="datetime-local"
              value={form.dueDate}
              onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Priority</span>
                <select
                  value={form.priority}
                  onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value as TaskPriority }))}
                  className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Recurring</span>
                <select
                  value={form.recurrence}
                  onChange={(event) => setForm((prev) => ({ ...prev, recurrence: event.target.value as TaskRecurrence }))}
                  className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-400">Initial Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as TaskStatus }))}
                className="w-full rounded-xl border border-slate-700 bg-panelAlt px-3 py-2.5 text-sm text-white focus:border-glow/70 focus:outline-none focus:ring-2 focus:ring-glow/25"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
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
                Total tasks: <span className="font-semibold text-white">{allTasks.length}</span>
              </p>
              <p>
                To Do: <span className="font-semibold text-white">{taskCounts.todo}</span>
              </p>
              <p>
                In Progress: <span className="font-semibold text-white">{taskCounts.inProgress}</span>
              </p>
              <p>
                Done: <span className="font-semibold text-white">{taskCounts.done}</span>
              </p>
              <p>
                Overdue: <span className="font-semibold text-rose-300">{overdueCount}</span>
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-glow" />
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Task List</p>
            </div>

            <AnimatePresence mode="popLayout">
              {allTasks.length === 0 ? (
                <motion.article
                  key="empty-productivity-list"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-dashed border-slate-700/80 bg-panel/60 p-5 text-center"
                >
                  <p className="text-sm text-slate-300">No tasks yet. Add your first task.</p>
                </motion.article>
              ) : (
                allTasks.map((task, index) => (
                  <TaskListCard
                    key={task.id ?? `${task.title}-${index}`}
                    task={task}
                    now={now}
                    index={index}
                    onEdit={startEdit}
                    onDelete={removeTask}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <KanbanSquare className="h-4 w-4 text-glow" />
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Kanban Board</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = allTasks.filter((task) => task.status === column.status);
            return (
              <div
                key={column.status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void handleDropStatus(column.status, event)}
                className="min-h-44 rounded-2xl border border-slate-700/70 bg-panel/75 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{column.label}</p>
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300">
                    {columnTasks.length}
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  {columnTasks.length === 0 ? (
                    <motion.p
                      key={`${column.status}-empty`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500"
                    >
                      Drop task here
                    </motion.p>
                  ) : (
                    columnTasks.map((task, index) => (
                      <motion.article
                        layout
                        draggable
                        onDragStart={(event) => {
                          if (task.id) {
                            event.dataTransfer.setData('text/plain', String(task.id));
                            setDraggingTaskId(task.id);
                          }
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                        key={`${column.status}-${task.id ?? index}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18, delay: index * 0.03 }}
                        className="mb-2 cursor-grab rounded-xl border border-white/10 bg-white/[0.03] p-3 active:cursor-grabbing"
                      >
                        <p className="text-sm text-white">{task.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${priorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                            {recurrenceLabel(task.recurrence)}
                          </span>
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

type TaskListCardProps = {
  task: ProductivityTaskRecord;
  now: number;
  index: number;
  onEdit: (task: ProductivityTaskRecord) => void;
  onDelete: (taskId?: number) => Promise<void>;
};

function TaskListCard({ task, now, index, onEdit, onDelete }: TaskListCardProps) {
  const isOverdue = task.dueAt !== null && task.dueAt <= now && task.status !== 'done';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-white">{task.title}</h3>
          <p className="text-xs text-slate-400">Status: {statusLabel(task.status)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${priorityBadge(task.priority)}`}>
            {task.priority}
          </span>
          <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
            {recurrenceLabel(task.recurrence)}
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Due Date</p>
          <div className="mt-1 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-glow" />
            <p className="text-sm text-white">{task.dueAt ? formatDateTime(task.dueAt) : 'Not set'}</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Time</p>
          <p className={`mt-1 text-sm font-semibold ${isOverdue ? 'text-rose-300' : 'text-glow'}`}>
            {task.dueAt ? formatDueLabel(task.dueAt, now) : 'Flexible'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" className="px-3" onClick={() => onEdit(task)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
        <Button type="button" variant="ghost" className="px-3" onClick={() => onDelete(task.id)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="ml-auto px-3"
          onClick={async () => {
            if (!task.id) return;
            if (task.status === 'done' && task.recurrence === 'none') {
              await setTaskStatus(task.id, 'todo');
              return;
            }
            await completeTask(task.id);
          }}
        >
          <Repeat className="mr-2 h-4 w-4" />
          {task.status === 'done' && task.recurrence === 'none'
            ? 'Reopen'
            : task.recurrence === 'none'
              ? 'Mark Done'
              : 'Complete + Reschedule'}
        </Button>
      </div>
    </motion.article>
  );
}

function recurrenceLabel(recurrence: TaskRecurrence) {
  if (recurrence === 'none') return 'One-time';
  if (recurrence === 'daily') return 'Daily';
  if (recurrence === 'weekly') return 'Weekly';
  return 'Monthly';
}

function statusLabel(status: TaskStatus) {
  if (status === 'todo') return 'To Do';
  if (status === 'in_progress') return 'In Progress';
  return 'Done';
}

function priorityBadge(priority: TaskPriority) {
  if (priority === 'high') return 'border border-rose-300/40 bg-rose-300/10 text-rose-200';
  if (priority === 'medium') return 'border border-amber-300/40 bg-amber-300/10 text-amber-200';
  return 'border border-emerald-300/40 bg-emerald-300/10 text-emerald-200';
}
