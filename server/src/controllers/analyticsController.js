import { ApiError } from '../utils/ApiError.js';
import { getPortfolioAnalytics } from '../services/portfolioAnalyticsService.js';
import { getApiCostSummary, recordApiUsage } from '../services/apiCostService.js';

function parseLimit(value, fallback = 40) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ApiError(400, 'holdingsLimit must be a number.');
  }
  const normalized = Math.floor(numeric);
  if (normalized < 1 || normalized > 200) {
    throw new ApiError(400, 'holdingsLimit must be between 1 and 200.');
  }
  return normalized;
}

function parseWindowDays(value, fallback = 30) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ApiError(400, 'days must be a number.');
  }
  const normalized = Math.floor(numeric);
  if (normalized < 1 || normalized > 365) {
    throw new ApiError(400, 'days must be between 1 and 365.');
  }
  return normalized;
}

function parseRecentLimit(value, fallback = 60) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ApiError(400, 'recentLimit must be a number.');
  }
  const normalized = Math.floor(numeric);
  if (normalized < 1 || normalized > 500) {
    throw new ApiError(400, 'recentLimit must be between 1 and 500.');
  }
  return normalized;
}

function parseProviderLimit(value, fallback = 20) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ApiError(400, 'providerLimit must be a number.');
  }
  const normalized = Math.floor(numeric);
  if (normalized < 1 || normalized > 50) {
    throw new ApiError(400, 'providerLimit must be between 1 and 50.');
  }
  return normalized;
}

export async function getNftPortfolioAnalytics(req, res) {
  const holdingsLimit = parseLimit(req.query?.holdingsLimit, 40);
  const result = await getPortfolioAnalytics({ holdingsLimit });
  res.json({ data: result });
}

export async function getApiCostsAnalytics(req, res) {
  const days = parseWindowDays(req.query?.days, 30);
  const recentLimit = parseRecentLimit(req.query?.recentLimit, 60);
  const providerLimit = parseProviderLimit(req.query?.providerLimit, 20);
  const summary = await getApiCostSummary({ days, recentLimit, providerLimit });
  res.json({ data: summary });
}

export async function postApiCostEvent(req, res) {
  const event = await recordApiUsage(req.body ?? {});
  res.status(201).json({ data: event });
}
