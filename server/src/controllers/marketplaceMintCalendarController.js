import { ApiError } from '../utils/ApiError.js';
import { getUpcomingMarketplaceMints } from '../services/marketplaceMintCalendarService.js';

function parseIntParam(value, fallback, min, max, fieldName) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ApiError(400, `${fieldName} must be a number.`);
  }
  const normalized = Math.floor(numeric);
  if (normalized < min || normalized > max) {
    throw new ApiError(400, `${fieldName} must be between ${min} and ${max}.`);
  }
  return normalized;
}

function parseProviderParam(value) {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'all' || normalized === 'magiceden' || normalized === 'opensea') {
    return normalized;
  }
  throw new ApiError(400, 'provider must be one of: all, magiceden, opensea.');
}

export async function getUpcomingMarketplaceMintCalendar(req, res) {
  const limit = parseIntParam(req.query?.limit, 30, 1, 100, 'limit');
  const days = parseIntParam(req.query?.days, 30, 1, 180, 'days');
  const provider = parseProviderParam(req.query?.provider);
  const result = await getUpcomingMarketplaceMints({ limit, days, provider });
  res.json({
    data: result.mints,
    meta: result.meta
  });
}
