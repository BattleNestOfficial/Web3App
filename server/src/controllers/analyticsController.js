import { ApiError } from '../utils/ApiError.js';
import { getPortfolioAnalytics } from '../services/portfolioAnalyticsService.js';

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

export async function getNftPortfolioAnalytics(req, res) {
  const holdingsLimit = parseLimit(req.query?.holdingsLimit, 40);
  const result = await getPortfolioAnalytics({ holdingsLimit });
  res.json({ data: result });
}

