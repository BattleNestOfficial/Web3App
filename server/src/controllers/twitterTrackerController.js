import { ApiError } from '../utils/ApiError.js';
import {
  createTwitterTracker,
  deleteTwitterTracker,
  getTwitterTrackerById,
  listTwitterMessages,
  listTwitterTrackers,
  syncAllTwitterTrackers,
  syncTwitterTrackerById,
  updateTwitterTracker
} from '../services/twitterTrackerService.js';

function parseId(value, fieldName = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive integer.`);
  }
  return id;
}

function parseLimit(value, fallback = 80) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError(400, 'limit must be a positive number.');
  }
  return Math.floor(numeric);
}

function validateCreatePayload(body) {
  const handle = typeof body?.handle === 'string' ? body.handle.trim() : '';
  const displayLabel = typeof body?.displayLabel === 'string' ? body.displayLabel.trim() : '';
  if (!handle) {
    throw new ApiError(400, 'Field "handle" is required.');
  }
  return {
    handle,
    displayLabel,
    enabled: body?.enabled
  };
}

function validateUpdatePayload(body) {
  const payload = {};
  if (typeof body?.handle === 'string') payload.handle = body.handle.trim();
  if (typeof body?.displayLabel === 'string') payload.displayLabel = body.displayLabel.trim();
  if (body?.enabled !== undefined) payload.enabled = body.enabled;
  return payload;
}

function toApiError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes('already tracked')) {
    return new ApiError(409, message);
  }
  if (message.toLowerCase().includes('twitter handle')) {
    return new ApiError(400, message);
  }
  return null;
}

export async function getTwitterTrackers(_req, res) {
  const trackers = await listTwitterTrackers();
  res.json({ data: trackers });
}

export async function getTwitterTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const tracker = await getTwitterTrackerById(id);
  if (!tracker) {
    throw new ApiError(404, 'Twitter tracker not found.');
  }
  res.json({ data: tracker });
}

export async function postTwitterTracker(req, res) {
  const payload = validateCreatePayload(req.body);
  try {
    const tracker = await createTwitterTracker(payload);
    res.status(201).json({ data: tracker });
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError) throw apiError;
    throw error;
  }
}

export async function putTwitterTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const payload = validateUpdatePayload(req.body);
  try {
    const tracker = await updateTwitterTracker(id, payload);
    if (!tracker) {
      throw new ApiError(404, 'Twitter tracker not found.');
    }
    res.json({ data: tracker });
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError) throw apiError;
    throw error;
  }
}

export async function removeTwitterTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const deleted = await deleteTwitterTracker(id);
  if (!deleted) {
    throw new ApiError(404, 'Twitter tracker not found.');
  }
  res.status(204).send();
}

export async function getTwitterMessages(req, res) {
  const trackerId = req.query?.trackerId ? parseId(req.query.trackerId, 'trackerId') : null;
  const limit = parseLimit(req.query?.limit, 80);
  const messages = await listTwitterMessages({ trackerId, limit });
  res.json({ data: messages });
}

export async function postTwitterTrackerSync(req, res) {
  const trackerId = req.body?.trackerId ?? req.query?.trackerId;
  if (trackerId !== undefined && trackerId !== null && trackerId !== '') {
    const id = parseId(trackerId, 'trackerId');
    const result = await syncTwitterTrackerById(id);
    if (!result) {
      throw new ApiError(404, 'Twitter tracker not found.');
    }
    res.json({ data: result });
    return;
  }

  const result = await syncAllTwitterTrackers();
  res.json({ data: result });
}
