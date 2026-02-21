import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import {
  createTodoTask,
  deleteTodoTask,
  getTodoTaskById,
  listTodoTasks,
  updateTodoTask
} from '../services/todoService.js';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);
const ALLOWED_REMINDER_OFFSETS = new Set([1440, 120, 60, 30, 10]);

function parseTaskId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Task id must be a positive integer.');
  }
  return id;
}

function normalizeReminderOffsets(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const unique = new Set();
  for (const value of input) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !ALLOWED_REMINDER_OFFSETS.has(parsed)) {
      continue;
    }
    unique.add(parsed);
  }
  return [...unique].sort((a, b) => b - a);
}

function validatePayload(body) {
  const clientIdRaw = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const dueAtRaw = body.dueAt;
  const priority = typeof body.priority === 'string' ? body.priority.trim().toLowerCase() : '';
  const done = Boolean(body.done);
  const reminderEmailEnabled =
    body.reminderEmailEnabled === undefined ? true : Boolean(body.reminderEmailEnabled);
  const reminderOffsets = normalizeReminderOffsets(body.reminderOffsets);

  if (!title) {
    throw new ApiError(400, 'Field "title" is required.');
  }
  if (title.length > 200) {
    throw new ApiError(400, 'Field "title" must be 200 characters or fewer.');
  }
  if (notes.length > 4000) {
    throw new ApiError(400, 'Field "notes" must be 4000 characters or fewer.');
  }
  if (!ALLOWED_PRIORITIES.has(priority)) {
    throw new ApiError(400, 'Field "priority" must be one of: low, medium, high.');
  }

  let dueAt = null;
  if (dueAtRaw !== null && dueAtRaw !== undefined && dueAtRaw !== '') {
    if (typeof dueAtRaw !== 'string') {
      throw new ApiError(400, 'Field "dueAt" must be an ISO datetime string or null.');
    }
    const timestamp = new Date(dueAtRaw).getTime();
    if (Number.isNaN(timestamp)) {
      throw new ApiError(400, 'Field "dueAt" must be a valid ISO datetime string.');
    }
    dueAt = new Date(timestamp).toISOString();
  }

  const clientId = clientIdRaw || crypto.randomUUID();
  return {
    clientId,
    title,
    notes,
    dueAt,
    priority,
    done,
    reminderEmailEnabled,
    reminderOffsets: dueAt ? reminderOffsets : []
  };
}

export async function getTodoTasks(_req, res) {
  const tasks = await listTodoTasks();
  res.json({ data: tasks });
}

export async function getTodoTask(req, res) {
  const id = parseTaskId(req.params.id);
  const task = await getTodoTaskById(id);
  if (!task) {
    throw new ApiError(404, 'Task not found.');
  }
  res.json({ data: task });
}

export async function postTodoTask(req, res) {
  const payload = validatePayload(req.body);
  const task = await createTodoTask(payload);
  res.status(201).json({ data: task });
}

export async function putTodoTask(req, res) {
  const id = parseTaskId(req.params.id);
  const payload = validatePayload(req.body);
  const task = await updateTodoTask(id, payload);
  if (!task) {
    throw new ApiError(404, 'Task not found.');
  }
  res.json({ data: task });
}

export async function removeTodoTask(req, res) {
  const id = parseTaskId(req.params.id);
  const deleted = await deleteTodoTask(id);
  if (!deleted) {
    throw new ApiError(404, 'Task not found.');
  }
  res.status(204).send();
}
