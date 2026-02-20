import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { triggerAutomationNotification } from './notificationService.js';

const SUPPORTED_EVENT_TYPES = ['buy', 'sell', 'mint', 'transfer'];
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function normalizeWalletAddress(input) {
  return String(input ?? '').trim().toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toIsoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compactString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function inferEventType(rawType, walletAddress, fromWallet, toWallet) {
  const normalizedType = String(rawType ?? '').toLowerCase();
  const from = normalizeWalletAddress(fromWallet);
  const to = normalizeWalletAddress(toWallet);
  const wallet = normalizeWalletAddress(walletAddress);

  if (normalizedType.includes('mint')) {
    return 'mint';
  }

  if (normalizedType.includes('sale') || normalizedType.includes('successful') || normalizedType.includes('order')) {
    if (from && from === wallet) return 'sell';
    if (to && to === wallet) return 'buy';
    return 'transfer';
  }

  if (normalizedType.includes('transfer')) {
    if (from === ZERO_ADDRESS && to === wallet) return 'mint';
    return 'transfer';
  }

  return null;
}

function extractRawEvents(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.events)) return payload.events;
  if (Array.isArray(payload.asset_events)) return payload.asset_events;
  if (Array.isArray(payload.activity)) return payload.activity;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseWalletEvent(rawEvent, walletAddress) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;

  const nft = rawEvent.nft ?? rawEvent.asset ?? rawEvent.item ?? null;
  const fromWallet =
    compactString(rawEvent.from_account?.address) ??
    compactString(rawEvent.seller?.address) ??
    compactString(rawEvent.maker?.address) ??
    compactString(rawEvent.from);
  const toWallet =
    compactString(rawEvent.to_account?.address) ??
    compactString(rawEvent.winner_account?.address) ??
    compactString(rawEvent.buyer?.address) ??
    compactString(rawEvent.taker?.address) ??
    compactString(rawEvent.to);

  const rawType =
    compactString(rawEvent.event_type) ??
    compactString(rawEvent.eventType) ??
    compactString(rawEvent.type) ??
    compactString(rawEvent.kind) ??
    compactString(rawEvent.event_name);
  const eventType = inferEventType(rawType, walletAddress, fromWallet, toWallet);
  if (!eventType) return null;

  const eventAt =
    toIsoString(rawEvent.event_timestamp) ??
    toIsoString(rawEvent.event_time) ??
    toIsoString(rawEvent.timestamp) ??
    toIsoString(rawEvent.created_date) ??
    toIsoString(rawEvent.created_at);
  if (!eventAt) return null;

  const txHash =
    compactString(rawEvent.transaction?.transaction_hash) ??
    compactString(rawEvent.transaction_hash) ??
    compactString(rawEvent.tx_hash);
  const tokenContract =
    compactString(nft?.contract) ??
    compactString(nft?.contract_address) ??
    compactString(nft?.asset_contract?.address);
  const tokenId = compactString(nft?.identifier) ?? compactString(nft?.token_id) ?? compactString(rawEvent.token_id);
  const collectionSlug = compactString(rawEvent.collection?.slug) ?? compactString(nft?.collection?.slug);
  const payment =
    rawEvent.payment ??
    rawEvent.payment_token ??
    rawEvent.paymentToken ??
    rawEvent.sale_price ??
    rawEvent.price ??
    null;
  const currencySymbol =
    compactString(payment?.symbol) ??
    compactString(payment?.token?.symbol) ??
    compactString(rawEvent.payment_token?.symbol);
  const priceValue =
    compactString(payment?.quantity) ??
    compactString(payment?.amount) ??
    compactString(rawEvent.total_price) ??
    compactString(rawEvent.sale_price);

  const fallbackId = [
    txHash,
    tokenContract,
    tokenId,
    eventType,
    eventAt
  ]
    .map((part) => compactString(part))
    .filter(Boolean)
    .join(':');
  const eventId =
    compactString(rawEvent.id) ??
    compactString(rawEvent.event_id) ??
    compactString(rawEvent.order_hash) ??
    fallbackId;
  if (!eventId) return null;

  return {
    eventId,
    eventType,
    txHash,
    tokenContract,
    tokenId,
    collectionSlug,
    currencySymbol,
    priceValue,
    fromWallet: normalizeWalletAddress(fromWallet),
    toWallet: normalizeWalletAddress(toWallet),
    eventAt,
    rawEvent
  };
}

function isWalletAddressValid(walletAddress) {
  return /^0x[a-f0-9]{40}$/i.test(walletAddress);
}

function isNotificationEnabled(tracker, eventType) {
  if (eventType === 'buy') return Boolean(tracker.notify_buy);
  if (eventType === 'sell') return Boolean(tracker.notify_sell);
  if (eventType === 'mint') return Boolean(tracker.notify_mint);
  return false;
}

async function fetchOpenSeaEvents(walletAddress) {
  const baseUrl = env.walletTracker.opensea.apiBaseUrl.replace(/\/+$/, '');
  const limit = Math.max(1, Math.min(100, Number(env.walletTracker.maxEventsPerWallet) || 50));
  const apiKey = env.walletTracker.opensea.apiKey;
  const endpoints = [
    `${baseUrl}/events/accounts/${walletAddress}?limit=${limit}`,
    `${baseUrl}/events?account_address=${walletAddress}&limit=${limit}`
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.walletTracker.requestTimeoutMs);
  const failures = [];

  try {
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {})
        },
        signal: controller.signal
      });

      if (!response.ok) {
        let reason = `HTTP ${response.status}`;
        try {
          const bodyText = await response.text();
          if (bodyText) {
            reason = `${reason} - ${bodyText.slice(0, 240)}`;
          }
        } catch {
          // Ignore body read failures.
        }
        failures.push({ endpoint, reason });
        continue;
      }

      const payload = await response.json();
      const rawEvents = extractRawEvents(payload);
      return rawEvents
        .map((event) => parseWalletEvent(event, walletAddress))
        .filter((event) => event && SUPPORTED_EVENT_TYPES.includes(event.eventType));
    }

    const detail = failures
      .map((entry) => `${entry.endpoint} => ${entry.reason}`)
      .join(' | ');
    const keyHint = apiKey
      ? ''
      : ' OPENSEA_API_KEY is missing; OpenSea may reject or heavily rate-limit unauthenticated requests.';
    throw new Error(`OpenSea account events request failed.${keyHint}${detail ? ` ${detail}` : ''}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function insertWalletEvent(client, tracker, event) {
  const result = await client.query(
    `INSERT INTO wallet_activity_events (
       tracker_id,
       event_id,
       event_type,
       tx_hash,
       token_contract,
       token_id,
       collection_slug,
       currency_symbol,
       price_value,
       from_wallet,
       to_wallet,
       event_at,
       marketplace,
       payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'opensea', $13::jsonb)
     ON CONFLICT (tracker_id, event_id)
     DO NOTHING
     RETURNING id`,
    [
      tracker.id,
      event.eventId,
      event.eventType,
      event.txHash,
      event.tokenContract,
      event.tokenId,
      event.collectionSlug,
      event.currencySymbol,
      event.priceValue,
      event.fromWallet || null,
      event.toWallet || null,
      event.eventAt,
      JSON.stringify(event.rawEvent)
    ]
  );

  return Boolean(result.rows[0]);
}

async function sendWalletActivityNotification(tracker, event) {
  const direction = event.eventType.toUpperCase();
  const label = tracker.wallet_label || tracker.wallet_address;
  const assetLabel = event.collectionSlug && event.tokenId ? `${event.collectionSlug} #${event.tokenId}` : 'NFT activity';
  const priceLabel = event.priceValue
    ? ` | Price: ${event.priceValue}${event.currencySymbol ? ` ${event.currencySymbol}` : ''}`
    : '';
  const body = `[${label}] ${direction} ${assetLabel}${priceLabel}`;

  await triggerAutomationNotification({
    workflowKey: 'wallet_activity_alert',
    runKey: `${tracker.id}-${event.eventId}`,
    title: `Wallet Alert: ${direction}`,
    body,
    htmlContent: `<p>${body}</p>`,
    metadata: {
      trackerId: tracker.id,
      walletAddress: tracker.wallet_address,
      eventType: event.eventType,
      tokenContract: event.tokenContract,
      tokenId: event.tokenId,
      collectionSlug: event.collectionSlug,
      txHash: event.txHash,
      eventAt: event.eventAt
    }
  });
}

function normalizeTrackerInput(input, existing = null) {
  const walletAddress = normalizeWalletAddress(input.walletAddress ?? existing?.wallet_address ?? '');
  const walletLabel = String(input.walletLabel ?? existing?.wallet_label ?? '').trim();
  const enabled = normalizeBoolean(input.enabled, existing ? existing.enabled : true);
  const notifyBuy = normalizeBoolean(input.notifyBuy, existing ? existing.notify_buy : true);
  const notifySell = normalizeBoolean(input.notifySell, existing ? existing.notify_sell : true);
  const notifyMint = normalizeBoolean(input.notifyMint, existing ? existing.notify_mint : true);

  return {
    walletAddress,
    walletLabel,
    enabled,
    notifyBuy,
    notifySell,
    notifyMint
  };
}

export async function listWalletTrackers() {
  const result = await pool.query(
    `SELECT
       t.id,
       t.wallet_address,
       t.wallet_label,
       t.platform,
       t.notify_buy,
       t.notify_sell,
       t.notify_mint,
       t.enabled,
       t.last_checked_at,
       t.last_event_at,
       t.created_at,
       t.updated_at,
       COALESCE(e.event_count, 0)::int AS event_count
     FROM wallet_trackers t
     LEFT JOIN (
       SELECT tracker_id, COUNT(*)::int AS event_count
       FROM wallet_activity_events
       GROUP BY tracker_id
     ) e ON e.tracker_id = t.id
     ORDER BY t.updated_at DESC`
  );
  return result.rows;
}

export async function getWalletTrackerById(id) {
  const result = await pool.query(
    `SELECT id, wallet_address, wallet_label, platform, notify_buy, notify_sell, notify_mint, enabled, last_checked_at, last_event_at, created_at, updated_at
     FROM wallet_trackers
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createWalletTracker(input) {
  const normalized = normalizeTrackerInput(input);
  if (!isWalletAddressValid(normalized.walletAddress)) {
    throw new Error('walletAddress must be a valid EVM address.');
  }

  const result = await pool.query(
    `INSERT INTO wallet_trackers (wallet_address, wallet_label, platform, notify_buy, notify_sell, notify_mint, enabled)
     VALUES ($1, $2, 'opensea', $3, $4, $5, $6)
     ON CONFLICT (wallet_address, platform)
     DO UPDATE SET
       wallet_label = EXCLUDED.wallet_label,
       notify_buy = EXCLUDED.notify_buy,
       notify_sell = EXCLUDED.notify_sell,
       notify_mint = EXCLUDED.notify_mint,
       enabled = EXCLUDED.enabled,
       updated_at = NOW()
     RETURNING id, wallet_address, wallet_label, platform, notify_buy, notify_sell, notify_mint, enabled, last_checked_at, last_event_at, created_at, updated_at`,
    [
      normalized.walletAddress,
      normalized.walletLabel || null,
      normalized.notifyBuy,
      normalized.notifySell,
      normalized.notifyMint,
      normalized.enabled
    ]
  );
  return result.rows[0];
}

export async function updateWalletTracker(id, input) {
  const current = await getWalletTrackerById(id);
  if (!current) return null;

  const normalized = normalizeTrackerInput(input, current);
  if (!isWalletAddressValid(normalized.walletAddress)) {
    throw new Error('walletAddress must be a valid EVM address.');
  }

  const result = await pool.query(
    `UPDATE wallet_trackers
     SET wallet_address = $2,
         wallet_label = $3,
         notify_buy = $4,
         notify_sell = $5,
         notify_mint = $6,
         enabled = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, wallet_address, wallet_label, platform, notify_buy, notify_sell, notify_mint, enabled, last_checked_at, last_event_at, created_at, updated_at`,
    [
      id,
      normalized.walletAddress,
      normalized.walletLabel || null,
      normalized.notifyBuy,
      normalized.notifySell,
      normalized.notifyMint,
      normalized.enabled
    ]
  );

  return result.rows[0] ?? null;
}

export async function deleteWalletTracker(id) {
  const result = await pool.query('DELETE FROM wallet_trackers WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}

export async function listWalletTrackerEvents({ trackerId = null, limit = 50 }) {
  const normalizedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const params = [normalizedLimit];
  let whereClause = '';

  if (trackerId) {
    params.push(trackerId);
    whereClause = 'WHERE e.tracker_id = $2';
  }

  const result = await pool.query(
    `SELECT
       e.id,
       e.tracker_id,
       e.event_id,
       e.event_type,
       e.tx_hash,
       e.token_contract,
       e.token_id,
       e.collection_slug,
       e.currency_symbol,
       e.price_value,
       e.from_wallet,
       e.to_wallet,
       e.event_at,
       e.marketplace,
       e.created_at,
       t.wallet_address,
       t.wallet_label
     FROM wallet_activity_events e
     INNER JOIN wallet_trackers t ON t.id = e.tracker_id
     ${whereClause}
     ORDER BY e.event_at DESC
     LIMIT $1`,
    params
  );

  return result.rows;
}

export async function syncWalletTracker(tracker) {
  if (!tracker?.enabled) {
    await pool.query('UPDATE wallet_trackers SET last_checked_at = NOW(), updated_at = NOW() WHERE id = $1', [
      tracker.id
    ]);
    return {
      trackerId: tracker.id,
      fetched: 0,
      inserted: 0,
      notified: 0,
      skipped: 'disabled'
    };
  }

  const events = await fetchOpenSeaEvents(tracker.wallet_address);
  const sinceDate = tracker.last_event_at
    ? toDate(tracker.last_event_at)
    : new Date(Date.now() - env.walletTracker.lookbackMinutes * 60 * 1000);

  const filteredEvents = events
    .filter((event) => {
      const eventDate = toDate(event.eventAt);
      if (!eventDate) return false;
      return !sinceDate || eventDate.getTime() >= sinceDate.getTime() - 1000;
    })
    .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime());

  const client = await pool.connect();
  let inserted = 0;
  let notified = 0;

  try {
    await client.query('BEGIN');

    for (const event of filteredEvents) {
      const created = await insertWalletEvent(client, tracker, event);
      if (created) inserted += 1;
    }

    const latestEventAt = filteredEvents.length > 0 ? filteredEvents[filteredEvents.length - 1].eventAt : null;
    await client.query(
      `UPDATE wallet_trackers
       SET last_checked_at = NOW(),
           last_event_at = COALESCE($2::timestamptz, last_event_at),
           updated_at = NOW()
       WHERE id = $1`,
      [tracker.id, latestEventAt]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (inserted > 0) {
    const latestInsertedEvents = await pool.query(
      `SELECT event_id, event_type, token_contract, token_id, collection_slug, currency_symbol, price_value, tx_hash, event_at
       FROM wallet_activity_events
       WHERE tracker_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tracker.id, inserted]
    );

    for (const event of latestInsertedEvents.rows.reverse()) {
      if (!isNotificationEnabled(tracker, event.event_type)) {
        continue;
      }
      try {
        await sendWalletActivityNotification(tracker, {
          eventId: event.event_id,
          eventType: event.event_type,
          tokenContract: event.token_contract,
          tokenId: event.token_id,
          collectionSlug: event.collection_slug,
          currencySymbol: event.currency_symbol,
          priceValue: event.price_value,
          txHash: event.tx_hash,
          eventAt: event.event_at
        });
        notified += 1;
      } catch {
        // Keep sync resilient if notification channel fails.
      }
    }
  }

  return {
    trackerId: tracker.id,
    fetched: events.length,
    inserted,
    notified
  };
}

export async function syncWalletTrackerById(id) {
  const tracker = await getWalletTrackerById(id);
  if (!tracker) return null;
  return syncWalletTracker(tracker);
}

export async function syncAllWalletTrackers() {
  const result = await pool.query(
    `SELECT id, wallet_address, wallet_label, platform, notify_buy, notify_sell, notify_mint, enabled, last_checked_at, last_event_at, created_at, updated_at
     FROM wallet_trackers
     ORDER BY updated_at DESC`
  );

  const trackers = result.rows;
  const runs = [];
  for (const tracker of trackers) {
    try {
      const syncResult = await syncWalletTracker(tracker);
      runs.push({ ...syncResult, status: 'ok' });
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
