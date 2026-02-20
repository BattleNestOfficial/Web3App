import crypto from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import {
  createFarmingProject,
  deleteFarmingProject,
  getFarmingProjectById,
  listFarmingProjects,
  updateFarmingProject
} from '../services/farmingService.js';

function parseProjectId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Project id must be a positive integer.');
  }
  return id;
}

function normalizeTasks(rawTasks) {
  const tasks = Array.isArray(rawTasks) ? rawTasks : [];
  const seen = new Set();
  const normalized = [];

  for (const task of tasks) {
    const id = typeof task?.id === 'string' ? task.id.trim() : '';
    const title = typeof task?.title === 'string' ? task.title.trim() : '';
    if (!id || !title || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({
      id,
      title,
      completed: Boolean(task.completed)
    });
  }

  return normalized;
}

function calculateProgress(tasks) {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter((task) => task.completed).length;
  return Math.round((completed / tasks.length) * 100);
}

function validatePayload(body) {
  const clientIdRaw = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const network = typeof body.network === 'string' ? body.network.trim() : '';
  const claimDateRaw = body.claimDate;
  const rewardNotes = typeof body.rewardNotes === 'string' ? body.rewardNotes.trim() : '';
  const tasks = normalizeTasks(body.tasks);

  if (!name) {
    throw new ApiError(400, 'Field "name" is required.');
  }

  if (!network) {
    throw new ApiError(400, 'Field "network" is required.');
  }

  let claimDate = null;
  if (claimDateRaw !== null && claimDateRaw !== undefined && claimDateRaw !== '') {
    if (typeof claimDateRaw !== 'string') {
      throw new ApiError(400, 'Field "claimDate" must be an ISO datetime string or null.');
    }
    const timestamp = new Date(claimDateRaw).getTime();
    if (Number.isNaN(timestamp)) {
      throw new ApiError(400, 'Field "claimDate" must be a valid ISO datetime string.');
    }
    claimDate = new Date(timestamp).toISOString();
  }

  const clientId = clientIdRaw || crypto.randomUUID();
  return {
    clientId,
    name,
    network,
    tasks,
    claimDate,
    rewardNotes,
    progress: calculateProgress(tasks)
  };
}

export async function getFarmingProjects(_req, res) {
  const projects = await listFarmingProjects();
  res.json({ data: projects });
}

export async function getFarmingProject(req, res) {
  const id = parseProjectId(req.params.id);
  const project = await getFarmingProjectById(id);
  if (!project) {
    throw new ApiError(404, 'Project not found.');
  }
  res.json({ data: project });
}

export async function postFarmingProject(req, res) {
  const payload = validatePayload(req.body);
  const project = await createFarmingProject(payload);
  res.status(201).json({ data: project });
}

export async function putFarmingProject(req, res) {
  const id = parseProjectId(req.params.id);
  const payload = validatePayload(req.body);
  const project = await updateFarmingProject(id, payload);
  if (!project) {
    throw new ApiError(404, 'Project not found.');
  }
  res.json({ data: project });
}

export async function removeFarmingProject(req, res) {
  const id = parseProjectId(req.params.id);
  const deleted = await deleteFarmingProject(id);
  if (!deleted) {
    throw new ApiError(404, 'Project not found.');
  }
  res.status(204).send();
}
