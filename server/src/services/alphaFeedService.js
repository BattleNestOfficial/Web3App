import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { recordApiUsageSafely } from './apiCostService.js';

const TWITTER_API_BASE_URL = 'https://api.twitter.com/2';
const DEFAULT_KEYWORDS = ['mint', 'testnet', 'airdrop'];

function normalizeText(value) {
  return value.trim().toLowerCase();
}

function normalizeKeywords(input) {
  const values = Array.isArray(input) ? input : [];
  const normalized = values.map((item) => normalizeText(String(item))).filter(Boolean);
  return Array.from(new Set(normalized));
}

function resolveAccounts(input) {
  const sanitize = (value) => String(value).trim().toLowerCase().replace(/^@/, '');
  const requested = Array.isArray(input)
    ? input.map((value) => sanitize(value)).filter(Boolean)
    : [];
  const configured = env.twitter.trackedAccounts.map((value) => sanitize(value)).filter(Boolean);
  const candidates = requested.length > 0 ? requested : configured;
  return Array.from(new Set(candidates));
}

function resolveKeywords(input) {
  const requested = normalizeKeywords(input);
  if (requested.length > 0) return requested;

  const configured = normalizeKeywords(env.twitter.keywords);
  if (configured.length > 0) return configured;
  return DEFAULT_KEYWORDS;
}

function clampLimit(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(100, Math.floor(numeric)));
}

function buildTweetUrl(authorUsername, tweetId) {
  return `https://x.com/${authorUsername}/status/${tweetId}`;
}

function getMatchedKeywords(text, keywords) {
  const normalizedText = normalizeText(text);
  return keywords.filter((keyword) => normalizedText.includes(keyword));
}

async function twitterRequest(path) {
  const token = env.twitter.bearerToken;
  if (!token) {
    throw new Error('Twitter API token is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.twitter.requestTimeoutMs);
  const endpoint = `${TWITTER_API_BASE_URL}${path}`;
  const startedAt = Date.now();
  let logged = false;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });

    void recordApiUsageSafely({
      providerKey: 'twitter',
      operation: 'fetch_tweets',
      endpoint,
      requestCount: 1,
      statusCode: response.status,
      success: response.ok,
      metadata: {
        service: 'alpha_feed',
        path,
        durationMs: Date.now() - startedAt
      }
    });
    logged = true;

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Twitter API request failed (${response.status}): ${body || 'unknown error'}`);
    }

    return response.json();
  } catch (error) {
    if (logged) {
      throw error;
    }
    void recordApiUsageSafely({
      providerKey: 'twitter',
      operation: 'fetch_tweets',
      endpoint,
      requestCount: 1,
      success: false,
      metadata: {
        service: 'alpha_feed',
        path,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUserByUsername(username) {
  const payload = await twitterRequest(`/users/by/username/${encodeURIComponent(username)}?user.fields=id,username`);
  return payload?.data ?? null;
}

async function fetchTweetsForUser(userId, limit) {
  const params = new URLSearchParams({
    max_results: String(clampLimit(limit, env.twitter.fetchLimit)),
    'tweet.fields': 'created_at,lang,public_metrics',
    exclude: 'replies,retweets'
  });

  const payload = await twitterRequest(`/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function upsertTweets(rows) {
  if (rows.length === 0) return 0;

  for (const row of rows) {
    await pool.query(
      `INSERT INTO alpha_tweets
       (tweet_id, author_id, author_username, text, url, matched_keywords, tweeted_at, fetched_at, raw_json, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8::jsonb, NOW())
       ON CONFLICT (tweet_id)
       DO UPDATE SET
         author_id = EXCLUDED.author_id,
         author_username = EXCLUDED.author_username,
         text = EXCLUDED.text,
         url = EXCLUDED.url,
         matched_keywords = EXCLUDED.matched_keywords,
         tweeted_at = EXCLUDED.tweeted_at,
         fetched_at = NOW(),
         raw_json = EXCLUDED.raw_json,
         updated_at = NOW()`,
      [
        row.tweetId,
        row.authorId,
        row.authorUsername,
        row.text,
        row.url,
        row.matchedKeywords,
        row.tweetedAt,
        JSON.stringify(row.rawJson ?? {})
      ]
    );
  }

  return rows.length;
}

export async function syncAlphaTweets({ accounts, keywords, limit }) {
  const selectedAccounts = resolveAccounts(accounts);
  const selectedKeywords = resolveKeywords(keywords);
  const fetchLimit = clampLimit(limit, env.twitter.fetchLimit);
  const errors = [];

  if (!env.twitter.bearerToken) {
    return {
      fetchedCount: 0,
      storedCount: 0,
      selectedAccounts,
      selectedKeywords,
      warnings: ['Twitter sync skipped: missing TWITTER_BEARER_TOKEN.'],
      errors
    };
  }

  if (selectedAccounts.length === 0) {
    return {
      fetchedCount: 0,
      storedCount: 0,
      selectedAccounts,
      selectedKeywords,
      warnings: ['Twitter sync skipped: no accounts selected/configured.'],
      errors
    };
  }

  const rowsToStore = [];
  let fetchedCount = 0;

  for (const account of selectedAccounts) {
    try {
      const user = await fetchUserByUsername(account);
      if (!user?.id || !user?.username) {
        errors.push(`Account not found: ${account}`);
        continue;
      }

      const tweets = await fetchTweetsForUser(user.id, fetchLimit);
      fetchedCount += tweets.length;

      for (const tweet of tweets) {
        const text = String(tweet?.text ?? '').trim();
        if (!text) continue;

        const matchedKeywords = getMatchedKeywords(text, selectedKeywords);
        if (matchedKeywords.length === 0) continue;

        const tweetId = String(tweet?.id ?? '').trim();
        const createdAt = String(tweet?.created_at ?? '').trim();
        if (!tweetId || !createdAt) continue;
        const tweetedAtMs = new Date(createdAt).getTime();
        if (Number.isNaN(tweetedAtMs)) continue;

        rowsToStore.push({
          tweetId,
          authorId: String(user.id),
          authorUsername: String(user.username).toLowerCase(),
          text,
          url: buildTweetUrl(String(user.username).toLowerCase(), tweetId),
          matchedKeywords,
          tweetedAt: new Date(tweetedAtMs).toISOString(),
          rawJson: tweet
        });
      }
    } catch (error) {
      errors.push(`Failed to sync @${account}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const storedCount = await upsertTweets(rowsToStore);
  return {
    fetchedCount,
    storedCount,
    selectedAccounts,
    selectedKeywords,
    warnings: [],
    errors
  };
}

export async function listAlphaTweets({ accounts, keywords, limit }) {
  const selectedAccounts = resolveAccounts(accounts);
  const selectedKeywords = resolveKeywords(keywords);
  const fetchLimit = clampLimit(limit, 40);

  const accountFilter = selectedAccounts.length > 0 ? selectedAccounts : null;
  const keywordFilter = selectedKeywords.length > 0 ? selectedKeywords : null;

  const result = await pool.query(
    `SELECT id, tweet_id, author_id, author_username, text, url, matched_keywords, tweeted_at, fetched_at, created_at, updated_at
     FROM alpha_tweets
     WHERE ($1::text[] IS NULL OR author_username = ANY($1))
       AND ($2::text[] IS NULL OR matched_keywords && $2)
     ORDER BY tweeted_at DESC
     LIMIT $3`,
    [accountFilter, keywordFilter, fetchLimit]
  );

  const metaResult = await pool.query(
    `SELECT MAX(fetched_at) AS last_fetched_at, COUNT(*)::int AS total_count
     FROM alpha_tweets`
  );

  const metaRow = metaResult.rows[0] ?? { last_fetched_at: null, total_count: 0 };

  return {
    tweets: result.rows,
    meta: {
      selectedAccounts,
      selectedKeywords,
      configuredAccounts: env.twitter.trackedAccounts,
      configuredKeywords: resolveKeywords([]),
      lastFetchedAt: metaRow.last_fetched_at,
      totalCount: metaRow.total_count
    }
  };
}
