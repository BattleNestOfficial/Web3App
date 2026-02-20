import { env } from '../config/env.js';
import { recordApiUsageSafely } from './apiCostService.js';

const OPEN_SEA_UPCOMING_DROPS_URL = 'https://opensea.io/drops/upcoming';
const OPEN_SEA_API_BASE_URL = 'https://api.opensea.io/api/v2';

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeDateToIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeChain(value, fallback = 'unknown') {
  const text = String(value ?? '').trim().toLowerCase();
  return text || fallback;
}

function compactString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseJsonObjectAt(html, startIndex) {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function dedupeById(items) {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    if (map.has(item.id)) continue;
    map.set(item.id, item);
  }
  return [...map.values()];
}

function buildMarketplaceUrl(source, slug) {
  if (!slug) return null;
  if (source === 'magiceden') {
    return `https://magiceden.io/launchpad/${slug}`;
  }
  if (source === 'opensea') {
    return `https://opensea.io/collection/${slug}`;
  }
  return null;
}

function mapMagicEdenMint(item) {
  const startsAt = normalizeDateToIso(item?.launchDatetime);
  if (!startsAt) return null;

  const slug = compactString(item?.symbol);
  const contractAddress = compactString(item?.contractAddress);
  const chain = normalizeChain(item?.chainId, 'solana');
  const id = `magiceden:${chain}:${contractAddress ?? slug ?? startsAt}`;

  return {
    id,
    source: 'magiceden',
    sourceLabel: 'Magic Eden',
    name: compactString(item?.name) ?? 'Untitled Mint',
    chain,
    startsAt,
    endsAt: null,
    url: buildMarketplaceUrl('magiceden', slug),
    imageUrl: compactString(item?.image),
    price: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
    currency: chain === 'solana' ? 'SOL' : null,
    supply: Number.isFinite(Number(item?.size)) ? Number(item.size) : null,
    contractAddress,
    stageLabel: 'Launch'
  };
}

function getOpenSeaStageEntries(drop) {
  const stages = Array.isArray(drop?.stages)
    ? drop.stages
    : Array.isArray(drop?.drop?.stages)
      ? drop.drop.stages
      : [];

  return stages
    .map((stage) => ({
      startTime: normalizeDateToIso(stage?.startTime),
      endTime: normalizeDateToIso(stage?.endTime)
    }))
    .filter((stage) => stage.startTime);
}

function mapOpenSeaDrop(drop, nowMs) {
  const stageEntries = getOpenSeaStageEntries(drop);
  if (stageEntries.length === 0) return null;

  const upcomingStages = stageEntries
    .map((stage) => ({
      ...stage,
      startMs: new Date(stage.startTime).getTime()
    }))
    .filter((stage) => Number.isFinite(stage.startMs) && stage.startMs >= nowMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (upcomingStages.length === 0) return null;
  const nextStage = upcomingStages[0];

  const collection = drop?.collection ?? {};
  const identifier = drop?.identifier ?? {};
  const chainId = normalizeChain(identifier?.chain?.identifier ?? collection?.chain?.identifier, 'ethereum');
  const contractAddress = compactString(identifier?.contractAddress);
  const slug = compactString(collection?.slug);
  const id = `opensea:${chainId}:${contractAddress ?? slug ?? nextStage.startTime}`;
  const stagePrice = drop?.activeDropStage?.price?.token?.unit ?? null;
  const stageCurrency = compactString(drop?.activeDropStage?.price?.token?.symbol);
  const maxSupply = Number.isFinite(Number(drop?.drop?.maxSupply)) ? Number(drop.drop.maxSupply) : null;

  return {
    id,
    source: 'opensea',
    sourceLabel: 'OpenSea',
    name: compactString(collection?.name) ?? 'Untitled Drop',
    chain: chainId,
    startsAt: nextStage.startTime,
    endsAt: nextStage.endTime ?? null,
    url: buildMarketplaceUrl('opensea', slug),
    imageUrl: compactString(collection?.imageUrl) ?? compactString(collection?.featuredImageUrl),
    price: Number.isFinite(Number(stagePrice)) ? Number(stagePrice) : null,
    currency: stageCurrency,
    supply: maxSupply,
    contractAddress,
    stageLabel: 'Drop Stage'
  };
}

async function fetchMagicEdenUpcomingMints({ limit, fromMs, toMs }) {
  const apiBase = env.walletTracker.magiceden.apiBaseUrl.replace(/\/+$/, '');
  const apiKey = env.walletTracker.magiceden.apiKey;
  const endpoint = `${apiBase}/v2/launchpad/collections`;
  const query = new URLSearchParams({
    offset: '0',
    limit: String(Math.max(20, Math.min(200, limit * 4)))
  });

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
    operation: 'marketplace_upcoming_mints',
    endpoint,
    requestCount: 1,
    statusCode: response.status,
    success: response.ok,
    metadata: {
      service: 'marketplace_mint_calendar',
      durationMs: Date.now() - startedAt
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Magic Eden request failed (${response.status}): ${body || 'unknown error'}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : [];

  return rows
    .map(mapMagicEdenMint)
    .filter(Boolean)
    .filter((item) => {
      const startMs = new Date(item.startsAt).getTime();
      return Number.isFinite(startMs) && startMs >= fromMs && startMs <= toMs;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, limit);
}

async function fetchOpenSeaUpcomingMints({ limit, fromMs, toMs }) {
  const fromApi = await fetchOpenSeaUpcomingMintsFromApi({ limit, fromMs, toMs });
  if (fromApi.length > 0) {
    return fromApi;
  }

  const startedAt = Date.now();
  const response = await fetch(OPEN_SEA_UPCOMING_DROPS_URL, {
    method: 'GET',
    headers: {
      Accept: 'text/html',
      'User-Agent': 'Mozilla/5.0 (compatible; MintCalendarBot/1.0)'
    }
  });

  void recordApiUsageSafely({
    providerKey: 'opensea',
    operation: 'marketplace_upcoming_mints_html_fallback',
    endpoint: OPEN_SEA_UPCOMING_DROPS_URL,
    requestCount: 1,
    statusCode: response.status,
    success: response.ok,
    metadata: {
      service: 'marketplace_mint_calendar',
      durationMs: Date.now() - startedAt
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenSea drops page request failed (${response.status}): ${body || 'unknown error'}`);
  }

  const html = await response.text();
  const marker = '{"__typename":"Erc721SeaDropV1","identifier":';
  const parsedDrops = [];
  let fromIndex = 0;

  while (true) {
    const start = html.indexOf(marker, fromIndex);
    if (start === -1) break;
    const rawJson = parseJsonObjectAt(html, start);
    if (!rawJson) break;

    try {
      const drop = JSON.parse(rawJson);
      parsedDrops.push(drop);
    } catch {
      // Ignore malformed JSON chunks.
    }

    fromIndex = start + marker.length;
  }

  return dedupeById(
    parsedDrops
      .map((drop) => mapOpenSeaDrop(drop, fromMs))
      .filter(Boolean)
      .filter((item) => {
        const startMs = new Date(item.startsAt).getTime();
        return Number.isFinite(startMs) && startMs >= fromMs && startMs <= toMs;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  ).slice(0, limit);
}

function mapOpenSeaApiDrop(item) {
  const startsAt =
    normalizeDateToIso(item?.startTime) ??
    normalizeDateToIso(item?.start_date) ??
    normalizeDateToIso(item?.mintStartTime) ??
    normalizeDateToIso(item?.launchDatetime);
  if (!startsAt) return null;

  const chain = normalizeChain(item?.chain ?? item?.chainId ?? item?.network, 'ethereum');
  const contractAddress = compactString(item?.contractAddress ?? item?.contract_address ?? item?.contract);
  const slug = compactString(item?.slug ?? item?.collectionSlug ?? item?.collection?.slug);
  const id = `opensea:${chain}:${contractAddress ?? slug ?? startsAt}`;

  return {
    id,
    source: 'opensea',
    sourceLabel: 'OpenSea',
    name: compactString(item?.name ?? item?.title ?? item?.collection?.name) ?? 'Untitled Drop',
    chain,
    startsAt,
    endsAt: normalizeDateToIso(item?.endTime ?? item?.end_date),
    url: buildMarketplaceUrl('opensea', slug),
    imageUrl: compactString(item?.imageUrl ?? item?.image_url ?? item?.collection?.image_url),
    price: Number.isFinite(Number(item?.price)) ? Number(item.price) : null,
    currency: compactString(item?.currency ?? item?.priceSymbol),
    supply: Number.isFinite(Number(item?.supply ?? item?.maxSupply)) ? Number(item?.supply ?? item?.maxSupply) : null,
    contractAddress,
    stageLabel: 'Drop Stage'
  };
}

async function fetchOpenSeaUpcomingMintsFromApi({ limit, fromMs, toMs }) {
  const apiKey = env.walletTracker.opensea.apiKey;
  const endpoints = [
    `${OPEN_SEA_API_BASE_URL}/drops/upcoming?limit=${Math.max(20, Math.min(100, limit * 3))}`,
    `${OPEN_SEA_API_BASE_URL}/drops?limit=${Math.max(20, Math.min(100, limit * 3))}`
  ];

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {})
      }
    });

    void recordApiUsageSafely({
      providerKey: 'opensea',
      operation: 'marketplace_upcoming_mints_api',
      endpoint,
      requestCount: 1,
      statusCode: response.status,
      success: response.ok,
      metadata: {
        service: 'marketplace_mint_calendar',
        durationMs: Date.now() - startedAt
      }
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.drops)
        ? payload.drops
        : Array.isArray(payload)
          ? payload
          : [];

    return dedupeById(
      rows
        .map(mapOpenSeaApiDrop)
        .filter(Boolean)
        .filter((item) => {
          const startMs = new Date(item.startsAt).getTime();
          return Number.isFinite(startMs) && startMs >= fromMs && startMs <= toMs;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    ).slice(0, limit);
  }

  return [];
}

export async function getUpcomingMarketplaceMints(options = {}) {
  const limit = clampNumber(options.limit, 1, 100, 30);
  const days = clampNumber(options.days, 1, 180, 30);
  const nowMs = Date.now();
  const horizonMs = nowMs + days * 24 * 60 * 60 * 1000;

  const [magicEdenResult, openSeaResult] = await Promise.allSettled([
    fetchMagicEdenUpcomingMints({ limit, fromMs: nowMs, toMs: horizonMs }),
    fetchOpenSeaUpcomingMints({ limit, fromMs: nowMs, toMs: horizonMs })
  ]);

  const providerStatus = {
    magiceden: {
      ok: magicEdenResult.status === 'fulfilled',
      count: magicEdenResult.status === 'fulfilled' ? magicEdenResult.value.length : 0,
      error: magicEdenResult.status === 'rejected' ? String(magicEdenResult.reason?.message ?? magicEdenResult.reason) : null
    },
    opensea: {
      ok: openSeaResult.status === 'fulfilled',
      count: openSeaResult.status === 'fulfilled' ? openSeaResult.value.length : 0,
      error: openSeaResult.status === 'rejected' ? String(openSeaResult.reason?.message ?? openSeaResult.reason) : null
    }
  };

  const combined = dedupeById([
    ...(magicEdenResult.status === 'fulfilled' ? magicEdenResult.value : []),
    ...(openSeaResult.status === 'fulfilled' ? openSeaResult.value : [])
  ])
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, limit);

  return {
    mints: combined,
    meta: {
      fetchedAt: new Date().toISOString(),
      days,
      limit,
      providers: providerStatus
    }
  };
}
