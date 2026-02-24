import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { recordApiUsageSafely } from './apiCostService.js';

const MAX_HANDLE_LENGTH = 15;

function normalizeHandle(value) {
  const raw = String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
  if (!raw) {
    throw new Error('Twitter handle is required.');
  }
  if (!/^[a-z0-9_]+$/i.test(raw) || raw.length > MAX_HANDLE_LENGTH) {
    throw new Error('Twitter handle must contain letters, numbers, underscore, and be <= 15 characters.');
  }
  return raw;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeLimit(value, fallback = 50, min = 1, max = 200) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function compactString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function decodeHtmlEntities(input) {
  return String(input ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function stripHtml(input) {
  return decodeHtmlEntities(String(input ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractXmlTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function parseTweetId(input) {
  const text = String(input ?? '');
  const fromStatus = text.match(/status\/(\d+)/i);
  if (fromStatus) return fromStatus[1];

  const numeric = text.match(/\b(\d{8,})\b/);
  if (numeric) return numeric[1];
  return null;
}

function summarizeBody(body, maxLen = 220) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text);
    const message =
      compactString(parsed?.title) ??
      compactString(parsed?.detail) ??
      compactString(parsed?.error?.message) ??
      compactString(parsed?.message);
    if (message) {
      return message.length > maxLen ? `${message.slice(0, maxLen)}...` : message;
    }
  } catch {
    // Keep text summary fallback.
  }

  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function mapTrackerRow(row) {
  return {
    id: Number(row.id),
    handle: row.handle,
    display_label: row.display_label,
    enabled: Boolean(row.enabled),
    last_checked_at: row.last_checked_at,
    last_tweet_at: row.last_tweet_at,
    last_tweet_id: row.last_tweet_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count: row.message_count !== undefined ? Number(row.message_count) : undefined
  };
}

function mapMessageRow(row) {
  return {
    id: Number(row.id),
    tracker_id: Number(row.tracker_id),
    tweet_id: row.tweet_id,
    tweet_text: row.tweet_text,
    tweet_url: row.tweet_url,
    tweeted_at: row.tweeted_at,
    author_handle: row.author_handle,
    created_at: row.created_at,
    handle: row.handle,
    display_label: row.display_label
  };
}

function buildTweetUrl(handle, tweetId) {
  return `https://x.com/${handle}/status/${tweetId}`;
}

function parseTwitterApiTweets(payload, handle) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((entry) => {
      const tweetId = compactString(entry?.id);
      const text = compactString(entry?.text);
      const tweetedAt = toIso(entry?.created_at);
      if (!tweetId || !text || !tweetedAt) return null;

      return {
        tweetId,
        text,
        tweetedAt,
        tweetUrl: buildTweetUrl(handle, tweetId),
        authorHandle: handle,
        payload: entry
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.tweetedAt).getTime() - new Date(a.tweetedAt).getTime());
}

function parseNitterRssTweets(xml, handle) {
  const content = String(xml ?? '');
  const items = [...content.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);

  return items
    .map((item) => {
      const link = extractXmlTag(item, 'link');
      const guid = extractXmlTag(item, 'guid');
      const title = stripHtml(extractXmlTag(item, 'title'));
      const description = stripHtml(extractXmlTag(item, 'description'));
      const pubDate = extractXmlTag(item, 'pubDate');
      const tweetId = parseTweetId(link || guid);
      const tweetedAt = toIso(pubDate);
      const textRaw = title || description;

      if (!tweetId || !tweetedAt || !textRaw) return null;
      const text = textRaw.replace(new RegExp(`^@?${handle}:\\s*`, 'i'), '').trim() || textRaw;
      return {
        tweetId,
        text,
        tweetedAt,
        tweetUrl: link || buildTweetUrl(handle, tweetId),
        authorHandle: handle,
        payload: {
          source: 'nitter_rss'
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.tweetedAt).getTime() - new Date(a.tweetedAt).getTime());
}

async function fetchTweetsViaTwitterApi(handle) {
  const token = compactString(env.twitterTracker.bearerToken);
  if (!token) return [];

  const baseUrl = String(env.twitterTracker.apiBaseUrl || 'https://api.twitter.com/2').replace(/\/+$/, '');
  const maxTweets = normalizeLimit(env.twitterTracker.maxTweetsPerHandle, 10, 5, 100);
  const query = encodeURIComponent(`from:${handle} -is:retweet`);
  const endpoint = `${baseUrl}/tweets/search/recent?query=${query}&max_results=${maxTweets}&tweet.fields=created_at`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizeLimit(env.twitterTracker.requestTimeoutMs, 15000, 1000, 120000));

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    });

    void recordApiUsageSafely({
      providerKey: 'twitter',
      operation: 'recent_tweets',
      endpoint,
      requestCount: 1,
      statusCode: response.status,
      success: response.ok,
      metadata: {
        service: 'twitter_tracker',
        durationMs: Date.now() - startedAt
      }
    });

    if (!response.ok) {
      const body = await response.text();
      const detail = summarizeBody(body);
      throw new Error(`Twitter API request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    return parseTwitterApiTweets(payload, handle);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTweetsViaNitterRss(handle) {
  const baseUrl = String(env.twitterTracker.nitterBaseUrl || 'https://nitter.net').replace(/\/+$/, '');
  const endpoint = `${baseUrl}/${handle}/rss`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizeLimit(env.twitterTracker.requestTimeoutMs, 15000, 1000, 120000));

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml'
      },
      signal: controller.signal
    });

    void recordApiUsageSafely({
      providerKey: 'twitter',
      operation: 'rss_tweets',
      endpoint,
      requestCount: 1,
      statusCode: response.status,
      success: response.ok,
      metadata: {
        service: 'twitter_tracker',
        durationMs: Date.now() - startedAt
      }
    });

    if (!response.ok) {
      const body = await response.text();
      const detail = summarizeBody(body);
      throw new Error(`Twitter RSS request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }

    const xml = await response.text();
    return parseNitterRssTweets(xml, handle);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRecentTweets(handle) {
  let apiError = null;
  try {
    const apiTweets = await fetchTweetsViaTwitterApi(handle);
    if (apiTweets.length > 0) {
      return apiTweets;
    }
  } catch (error) {
    apiError = error instanceof Error ? error.message : String(error);
  }

  try {
    const rssTweets = await fetchTweetsViaNitterRss(handle);
    return rssTweets;
  } catch (rssError) {
    const rssMessage = rssError instanceof Error ? rssError.message : String(rssError);
    if (apiError) {
      throw new Error(`Twitter sources failed. API: ${apiError}. RSS: ${rssMessage}`);
    }
    throw new Error(rssMessage);
  }
}

export async function listTwitterTrackers() {
  const result = await pool.query(
    `SELECT
       t.id,
       t.handle,
       t.display_label,
       t.enabled,
       t.last_checked_at,
       t.last_tweet_at,
       t.last_tweet_id,
       t.created_at,
       t.updated_at,
       COALESCE(m.message_count, 0)::int AS message_count
     FROM twitter_trackers t
     LEFT JOIN (
       SELECT tracker_id, COUNT(*)::int AS message_count
       FROM twitter_messages
       GROUP BY tracker_id
     ) m ON m.tracker_id = t.id
     ORDER BY t.updated_at DESC`
  );
  return result.rows.map(mapTrackerRow);
}

export async function getTwitterTrackerById(id) {
  const result = await pool.query(
    `SELECT
       id,
       handle,
       display_label,
       enabled,
       last_checked_at,
       last_tweet_at,
       last_tweet_id,
       created_at,
       updated_at
     FROM twitter_trackers
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? mapTrackerRow(result.rows[0]) : null;
}

export async function createTwitterTracker(payload) {
  const handle = normalizeHandle(payload?.handle);
  const displayLabel = compactString(payload?.displayLabel ?? payload?.display_label);
  const enabled = normalizeBoolean(payload?.enabled, true);

  const existing = await pool.query('SELECT id FROM twitter_trackers WHERE handle = $1', [handle]);
  if (existing.rows.length > 0) {
    throw new Error('Twitter handle already tracked.');
  }

  const result = await pool.query(
    `INSERT INTO twitter_trackers (handle, display_label, enabled)
     VALUES ($1, $2, $3)
     RETURNING
       id,
       handle,
       display_label,
       enabled,
       last_checked_at,
       last_tweet_at,
       last_tweet_id,
       created_at,
       updated_at`,
    [handle, displayLabel, enabled]
  );

  return mapTrackerRow(result.rows[0]);
}

export async function updateTwitterTracker(id, payload) {
  const current = await getTwitterTrackerById(id);
  if (!current) return null;

  const nextHandle =
    payload?.handle !== undefined && payload?.handle !== null && payload?.handle !== ''
      ? normalizeHandle(payload.handle)
      : current.handle;
  const nextDisplayLabel =
    payload?.displayLabel !== undefined || payload?.display_label !== undefined
      ? compactString(payload?.displayLabel ?? payload?.display_label)
      : current.display_label;
  const nextEnabled =
    payload?.enabled === undefined ? current.enabled : normalizeBoolean(payload.enabled, current.enabled);

  if (nextHandle !== current.handle) {
    const duplicate = await pool.query('SELECT id FROM twitter_trackers WHERE handle = $1 AND id <> $2', [nextHandle, id]);
    if (duplicate.rows.length > 0) {
      throw new Error('Twitter handle already tracked.');
    }
  }

  const result = await pool.query(
    `UPDATE twitter_trackers
     SET
       handle = $2,
       display_label = $3,
       enabled = $4,
       updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       handle,
       display_label,
       enabled,
       last_checked_at,
       last_tweet_at,
       last_tweet_id,
       created_at,
       updated_at`,
    [id, nextHandle, nextDisplayLabel, nextEnabled]
  );
  return result.rows[0] ? mapTrackerRow(result.rows[0]) : null;
}

export async function deleteTwitterTracker(id) {
  const result = await pool.query('DELETE FROM twitter_trackers WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}

export async function listTwitterMessages({ trackerId = null, limit = 80 } = {}) {
  const safeLimit = normalizeLimit(limit, 80, 1, 500);
  const params = [safeLimit];
  let whereClause = '';
  if (trackerId) {
    params.push(trackerId);
    whereClause = 'WHERE m.tracker_id = $2';
  }

  const result = await pool.query(
    `SELECT
       m.id,
       m.tracker_id,
       m.tweet_id,
       m.tweet_text,
       m.tweet_url,
       m.tweeted_at,
       m.author_handle,
       m.created_at,
       t.handle,
       t.display_label
     FROM twitter_messages m
     INNER JOIN twitter_trackers t ON t.id = m.tracker_id
     ${whereClause}
     ORDER BY m.tweeted_at DESC
     LIMIT $1`,
    params
  );

  return result.rows.map(mapMessageRow);
}

async function insertTweetIfNew(client, tracker, tweet) {
  const result = await client.query(
    `INSERT INTO twitter_messages (
       tracker_id,
       tweet_id,
       tweet_text,
       tweet_url,
       tweeted_at,
       author_handle,
       payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (tracker_id, tweet_id)
     DO NOTHING
     RETURNING id`,
    [
      tracker.id,
      tweet.tweetId,
      tweet.text,
      tweet.tweetUrl,
      tweet.tweetedAt,
      tweet.authorHandle,
      JSON.stringify(tweet.payload ?? {})
    ]
  );

  return result.rows.length > 0;
}

export async function syncTwitterTracker(tracker) {
  if (!tracker) {
    throw new Error('Tracker is required.');
  }

  if (!tracker.enabled) {
    await pool.query('UPDATE twitter_trackers SET last_checked_at = NOW(), updated_at = NOW() WHERE id = $1', [tracker.id]);
    return { trackerId: tracker.id, status: 'disabled', fetched: 0, inserted: 0 };
  }

  const tweets = await fetchRecentTweets(tracker.handle);
  const baseline = toDate(tracker.last_tweet_at) ?? toDate(tracker.created_at) ?? new Date(0);
  const baselineMs = baseline.getTime();

  const freshTweets = tweets
    .filter((tweet) => {
      const date = toDate(tweet.tweetedAt);
      return date && date.getTime() > baselineMs;
    })
    .sort((a, b) => new Date(a.tweetedAt).getTime() - new Date(b.tweetedAt).getTime());

  const newestSeen = tweets[0] ?? null;
  const newestFresh = freshTweets[freshTweets.length - 1] ?? null;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    for (const tweet of freshTweets) {
      const created = await insertTweetIfNew(client, tracker, tweet);
      if (created) inserted += 1;
    }

    const nextLastTweetAt = newestFresh?.tweetedAt ?? tracker.last_tweet_at ?? newestSeen?.tweetedAt ?? null;
    const nextLastTweetId = newestFresh?.tweetId ?? tracker.last_tweet_id ?? newestSeen?.tweetId ?? null;

    await client.query(
      `UPDATE twitter_trackers
       SET
         last_checked_at = NOW(),
         last_tweet_at = $2,
         last_tweet_id = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [tracker.id, nextLastTweetAt, nextLastTweetId]
    );

    await client.query('COMMIT');
    return {
      trackerId: tracker.id,
      status: 'ok',
      fetched: tweets.length,
      inserted
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function syncTwitterTrackerById(id) {
  const tracker = await getTwitterTrackerById(id);
  if (!tracker) return null;
  return syncTwitterTracker(tracker);
}

export async function syncAllTwitterTrackers() {
  const result = await pool.query(
    `SELECT
       id,
       handle,
       display_label,
       enabled,
       last_checked_at,
       last_tweet_at,
       last_tweet_id,
       created_at,
       updated_at
     FROM twitter_trackers
     ORDER BY created_at ASC`
  );

  const trackers = result.rows.map(mapTrackerRow);
  const runs = [];

  for (const tracker of trackers) {
    try {
      const sync = await syncTwitterTracker(tracker);
      runs.push(sync);
    } catch (error) {
      runs.push({
        trackerId: tracker.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    trackers: trackers.length,
    runs
  };
}

