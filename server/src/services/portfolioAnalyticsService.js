import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { recordApiUsageSafely } from './apiCostService.js';

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeCurrency(value, fallback = 'ETH') {
  const text = normalizeText(value).toUpperCase();
  return text || fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function addToCurrencyMap(map, currency, amount) {
  const normalizedAmount = toNumber(amount, 0);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount === 0) return;
  const key = normalizeCurrency(currency, 'ETH');
  map.set(key, round((map.get(key) ?? 0) + normalizedAmount));
}

function currencyMapToRows(map) {
  return [...map.entries()]
    .map(([currency, amount]) => ({ currency, amount: round(amount) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function resolveCollectionChain(eventPayload) {
  return normalizeText(
    eventPayload?.asset?.chain ??
      eventPayload?.collection?.chain ??
      eventPayload?.chain ??
      env.walletTracker.magiceden.evmChain,
    env.walletTracker.magiceden.evmChain
  ).toLowerCase();
}

function extractAskNativePrice(activity) {
  return toNumber(activity?.ask?.price?.amount?.native, NaN);
}

function extractAskUsdPrice(activity) {
  return toNumber(activity?.ask?.price?.amount?.fiat?.usd, NaN);
}

async function fetchLiveCollectionPrice({ chain, collectionId }) {
  const baseUrl = env.walletTracker.magiceden.apiBaseUrl.replace(/\/+$/, '');
  const apiKey = env.walletTracker.magiceden.apiKey;

  async function requestActivities(activityType, limit) {
    const query = new URLSearchParams();
    query.set('chain', normalizeText(chain, env.walletTracker.magiceden.evmChain).toLowerCase());
    query.set('collectionId', normalizeText(collectionId).toLowerCase());
    query.set('limit', String(limit));
    query.append('activityTypes[]', activityType);

    const endpoint = `${baseUrl}/v4/evm-public/activities`;
    const startedAt = Date.now();
    const response = await fetch(`${endpoint}?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      }
    });

    void recordApiUsageSafely({
      providerKey: 'magiceden',
      operation: 'portfolio_live_price',
      endpoint,
      requestCount: 1,
      statusCode: response.status,
      success: response.ok,
      metadata: {
        service: 'portfolio_analytics',
        activityType,
        durationMs: Date.now() - startedAt
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Magic Eden activities failed (${response.status}): ${body || 'unknown error'}`);
    }

    const payload = await response.json();
    return Array.isArray(payload?.activities) ? payload.activities : [];
  }

  const askActivities = await requestActivities('ASK_CREATED', 20);
  if (askActivities.length > 0) {
    const candidates = askActivities
      .map((activity) => ({
        native: extractAskNativePrice(activity),
        usd: extractAskUsdPrice(activity),
        symbol: normalizeCurrency(activity?.ask?.price?.currency?.symbol, 'ETH'),
        timestamp: activity?.timestamp ?? null
      }))
      .filter((candidate) => Number.isFinite(candidate.native) && candidate.native > 0)
      .sort((a, b) => a.native - b.native);

    if (candidates.length > 0) {
      const best = candidates[0];
      return {
        native: round(best.native),
        usd: Number.isFinite(best.usd) ? round(best.usd, 2) : null,
        currency: best.symbol,
        eventAt: best.timestamp,
        source: 'ask_floor'
      };
    }
  }

  const tradeActivities = await requestActivities('TRADE', 1);
  const activity = tradeActivities[0];
  if (!activity) return null;

  const native = toNumber(activity?.unitPrice?.amount?.native, NaN);
  const usd = toNumber(activity?.unitPrice?.amount?.fiat?.usd, NaN);
  const symbol = normalizeCurrency(activity?.unitPrice?.currency?.symbol, 'ETH');
  if (!Number.isFinite(native)) return null;

  return {
    native: round(native),
    usd: Number.isFinite(usd) ? round(usd, 2) : null,
    currency: symbol,
    eventAt: activity?.timestamp ?? null,
    source: 'last_trade'
  };
}

export async function getPortfolioAnalytics(options = {}) {
  const holdingsLimit = Math.max(1, Math.min(100, Number(options.holdingsLimit) || 40));

  const [trackersResult, eventsResult] = await Promise.all([
    pool.query('SELECT id, wallet_address, wallet_label, platform, enabled FROM wallet_trackers ORDER BY created_at ASC'),
    pool.query(
      `SELECT
         tracker_id,
         event_type,
         token_contract,
         token_id,
         collection_slug,
         currency_symbol,
         price_value,
         event_at,
         marketplace,
         payload
       FROM wallet_activity_events
       WHERE token_contract IS NOT NULL
         AND token_contract <> ''
         AND token_id IS NOT NULL
         AND token_id <> ''
       ORDER BY event_at ASC`
    )
  ]);

  const trackers = trackersResult.rows;
  const events = eventsResult.rows;

  const positions = new Map();
  const realizedByCurrency = new Map();
  let mintedNfts = 0;

  for (const event of events) {
    const tokenContract = normalizeText(event.token_contract).toLowerCase();
    const tokenId = normalizeText(event.token_id);
    if (!tokenContract || !tokenId) continue;

    const key = `${tokenContract}:${tokenId}`;
    const eventType = normalizeText(event.event_type).toLowerCase();
    const priceNative = Math.max(0, toNumber(event.price_value, 0));
    const currency = normalizeCurrency(event.currency_symbol, 'ETH');

    if (!positions.has(key)) {
      positions.set(key, {
        key,
        tokenContract,
        tokenId,
        collectionId: normalizeText(event.collection_slug, tokenContract),
        chain: resolveCollectionChain(event.payload ?? {}),
        quantity: 0,
        totalCostNative: 0,
        costCurrency: currency,
        firstSeenAt: event.event_at,
        lastSeenAt: event.event_at
      });
    }

    const position = positions.get(key);
    position.lastSeenAt = event.event_at;
    if (position.quantity === 0 && eventType !== 'sell') {
      position.costCurrency = currency;
    }

    if (eventType === 'mint') {
      mintedNfts += 1;
      position.quantity += 1;
      position.totalCostNative += priceNative;
      continue;
    }

    if (eventType === 'buy') {
      position.quantity += 1;
      position.totalCostNative += priceNative;
      continue;
    }

    if (eventType === 'sell') {
      if (position.quantity > 0) {
        const avgCost = position.totalCostNative / position.quantity;
        const realized = priceNative - avgCost;
        addToCurrencyMap(realizedByCurrency, currency, realized);
        position.quantity -= 1;
        position.totalCostNative = Math.max(0, position.totalCostNative - avgCost);
      } else {
        addToCurrencyMap(realizedByCurrency, currency, priceNative);
      }
    }
  }

  const openPositions = [...positions.values()]
    .filter((position) => position.quantity > 0)
    .slice(0, holdingsLimit);

  const priceCache = new Map();
  const priceErrors = [];
  const requestDelayMs = env.walletTracker.magiceden.apiKey ? 120 : 550;

  for (const position of openPositions) {
    const cacheKey = `${position.chain}:${position.collectionId}`;
    if (priceCache.has(cacheKey)) continue;
    try {
      const latestTrade = await fetchLiveCollectionPrice({
        chain: position.chain,
        collectionId: position.collectionId
      });
      priceCache.set(cacheKey, latestTrade);
    } catch (error) {
      priceCache.set(cacheKey, null);
      priceErrors.push({
        collectionId: position.collectionId,
        chain: position.chain,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    await sleep(requestDelayMs);
  }

  const unrealizedByCurrency = new Map();
  const estimatedValueByCurrency = new Map();
  const holdings = openPositions.map((position) => {
    const costBasisNative = position.totalCostNative;
    const avgCostNative = position.quantity > 0 ? costBasisNative / position.quantity : 0;
    const cacheKey = `${position.chain}:${position.collectionId}`;
    const live = priceCache.get(cacheKey) ?? null;
    const livePriceNative = live?.native ?? null;
    const livePriceUsd = live?.usd ?? null;
    const liveCurrency = live?.currency ?? position.costCurrency;

    let currentValueNative = null;
    let unrealizedNative = null;
    if (livePriceNative !== null) {
      currentValueNative = livePriceNative * position.quantity;
      unrealizedNative = currentValueNative - costBasisNative;
      addToCurrencyMap(unrealizedByCurrency, liveCurrency, unrealizedNative);
      addToCurrencyMap(estimatedValueByCurrency, liveCurrency, currentValueNative);
    }

    return {
      tokenContract: position.tokenContract,
      tokenId: position.tokenId,
      collectionId: position.collectionId,
      chain: position.chain,
      quantity: position.quantity,
      currency: liveCurrency,
      costBasisNative: round(costBasisNative),
      avgCostNative: round(avgCostNative),
      livePriceNative: livePriceNative !== null ? round(livePriceNative) : null,
      livePriceUsd: livePriceUsd,
      currentValueNative: currentValueNative !== null ? round(currentValueNative) : null,
      unrealizedPnlNative: unrealizedNative !== null ? round(unrealizedNative) : null,
      livePriceAsOf: live?.eventAt ?? null,
      livePriceSource: live?.source ?? null
    };
  });

  return {
    summary: {
      trackedWallets: trackers.length,
      activeTrackers: trackers.filter((tracker) => tracker.enabled).length,
      totalEvents: events.length,
      mintedNfts,
      holdingsCount: holdings.length,
      realizedPnl: currencyMapToRows(realizedByCurrency),
      unrealizedPnl: currencyMapToRows(unrealizedByCurrency),
      estimatedValue: currencyMapToRows(estimatedValueByCurrency)
    },
    holdings: holdings.sort((a, b) => (b.currentValueNative ?? 0) - (a.currentValueNative ?? 0)),
    meta: {
      fetchedAt: new Date().toISOString(),
      holdingsLimit,
      priceCollectionsRequested: priceCache.size,
      priceCollectionsResolved: [...priceCache.values()].filter(Boolean).length,
      priceErrors
    }
  };
}
