import { listAlphaTweets, syncAlphaTweets } from '../services/alphaFeedService.js';

function parseCsvParam(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseLimit(value, fallback = 40) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(100, Math.floor(numeric)));
}

function normalizeResponseTweet(row) {
  return {
    id: row.id,
    tweetId: row.tweet_id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    text: row.text,
    url: row.url,
    matchedKeywords: row.matched_keywords ?? [],
    tweetedAt: row.tweeted_at,
    fetchedAt: row.fetched_at
  };
}

export async function getAlphaFeed(req, res) {
  const accounts = parseCsvParam(req.query.accounts);
  const keywords = parseCsvParam(req.query.keywords);
  const limit = parseLimit(req.query.limit, 40);
  const shouldRefresh = parseBoolean(req.query.refresh);

  let sync = null;
  if (shouldRefresh) {
    sync = await syncAlphaTweets({ accounts, keywords, limit });
  }

  const result = await listAlphaTweets({ accounts, keywords, limit });

  res.json({
    data: result.tweets.map(normalizeResponseTweet),
    meta: {
      ...result.meta,
      sync
    }
  });
}

export async function syncAlphaFeed(req, res) {
  const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
  const limit = parseLimit(req.body?.limit, 40);

  const sync = await syncAlphaTweets({ accounts, keywords, limit });
  const result = await listAlphaTweets({ accounts, keywords, limit });

  res.json({
    data: result.tweets.map(normalizeResponseTweet),
    meta: {
      ...result.meta,
      sync
    }
  });
}
