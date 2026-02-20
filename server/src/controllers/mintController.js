import { ApiError } from '../utils/ApiError.js';
import crypto from 'node:crypto';
import {
  createMint,
  deleteMint,
  getMintById,
  listMints,
  updateMint
} from '../services/mintService.js';

function parseMintId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Mint id must be a positive integer.');
  }
  return id;
}

function validateMintPayload(body) {
  const clientIdRaw = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const chain = typeof body.chain === 'string' ? body.chain.trim() : '';
  const mintDate = typeof body.mintDate === 'string' ? body.mintDate.trim() : '';
  const visibility = body.visibility;
  const link = typeof body.link === 'string' ? body.link.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const reminderOffsetsRaw = Array.isArray(body.reminderOffsets) ? body.reminderOffsets : [];

  if (!name) throw new ApiError(400, 'Field "name" is required.');
  if (!chain) throw new ApiError(400, 'Field "chain" is required.');
  if (!mintDate || Number.isNaN(new Date(mintDate).getTime())) {
    throw new ApiError(400, 'Field "mintDate" must be a valid ISO datetime string.');
  }
  if (visibility !== 'whitelist' && visibility !== 'public') {
    throw new ApiError(400, 'Field "visibility" must be "whitelist" or "public".');
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw new ApiError(400, 'Field "link" must start with http:// or https://');
  }

  const reminderOffsets = Array.from(new Set(reminderOffsetsRaw.map((value) => Number(value)).filter(Number.isFinite)))
    .filter((value) => value === 60 || value === 30 || value === 10)
    .sort((a, b) => b - a);

  const clientId = clientIdRaw || crypto.randomUUID();
  return { clientId, name, chain, mintDate, visibility, link, notes, reminderOffsets };
}

export async function getMints(_req, res) {
  const mints = await listMints();
  res.json({ data: mints });
}

export async function getMint(req, res) {
  const id = parseMintId(req.params.id);
  const mint = await getMintById(id);
  if (!mint) {
    throw new ApiError(404, 'Mint not found.');
  }
  res.json({ data: mint });
}

export async function postMint(req, res) {
  const payload = validateMintPayload(req.body);
  const mint = await createMint(payload);
  res.status(201).json({ data: mint });
}

export async function putMint(req, res) {
  const id = parseMintId(req.params.id);
  const payload = validateMintPayload(req.body);
  const mint = await updateMint(id, payload);
  if (!mint) {
    throw new ApiError(404, 'Mint not found.');
  }
  res.json({ data: mint });
}

export async function removeMintById(req, res) {
  const id = parseMintId(req.params.id);
  const deleted = await deleteMint(id);
  if (!deleted) {
    throw new ApiError(404, 'Mint not found.');
  }
  res.status(204).send();
}
