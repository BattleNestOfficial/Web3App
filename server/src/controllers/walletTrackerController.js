import { ApiError } from '../utils/ApiError.js';
import {
  createWalletTracker,
  deleteWalletTracker,
  getWalletTrackerById,
  listWalletTrackerEvents,
  listWalletTrackers,
  syncAllWalletTrackers,
  syncWalletTrackerById,
  updateWalletTracker
} from '../services/walletTrackerService.js';

function parseId(value, fieldName = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `${fieldName} must be a positive integer.`);
  }
  return id;
}

function parseLimit(value, fallback = 50) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError(400, 'limit must be a positive number.');
  }
  return Math.floor(numeric);
}

function validatePayload(body) {
  const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';
  const walletLabel = typeof body?.walletLabel === 'string' ? body.walletLabel.trim() : '';

  if (!walletAddress) {
    throw new ApiError(400, 'Field "walletAddress" is required.');
  }

  return {
    walletAddress,
    walletLabel,
    enabled: body?.enabled,
    notifyBuy: body?.notifyBuy,
    notifySell: body?.notifySell,
    notifyMint: body?.notifyMint
  };
}

export async function getWalletTrackers(_req, res) {
  const trackers = await listWalletTrackers();
  res.json({ data: trackers });
}

export async function getWalletTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const tracker = await getWalletTrackerById(id);
  if (!tracker) {
    throw new ApiError(404, 'Wallet tracker not found.');
  }
  res.json({ data: tracker });
}

export async function postWalletTracker(req, res) {
  const payload = validatePayload(req.body);
  const tracker = await createWalletTracker(payload);
  res.status(201).json({ data: tracker });
}

export async function putWalletTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const payload = validatePayload(req.body);
  const tracker = await updateWalletTracker(id, payload);
  if (!tracker) {
    throw new ApiError(404, 'Wallet tracker not found.');
  }
  res.json({ data: tracker });
}

export async function removeWalletTracker(req, res) {
  const id = parseId(req.params.id, 'tracker id');
  const deleted = await deleteWalletTracker(id);
  if (!deleted) {
    throw new ApiError(404, 'Wallet tracker not found.');
  }
  res.status(204).send();
}

export async function getWalletTrackerEvents(req, res) {
  const trackerId = req.query?.trackerId ? parseId(req.query.trackerId, 'trackerId') : null;
  const limit = parseLimit(req.query?.limit, 50);
  const events = await listWalletTrackerEvents({ trackerId, limit });
  res.json({ data: events });
}

export async function postWalletTrackerSync(req, res) {
  const trackerId = req.body?.trackerId ?? req.query?.trackerId;
  if (trackerId !== undefined && trackerId !== null && trackerId !== '') {
    const id = parseId(trackerId, 'trackerId');
    const result = await syncWalletTrackerById(id);
    if (!result) {
      throw new ApiError(404, 'Wallet tracker not found.');
    }
    res.json({ data: result });
    return;
  }

  const result = await syncAllWalletTrackers();
  res.json({ data: result });
}
