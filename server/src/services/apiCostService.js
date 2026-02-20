import { pool } from '../config/db.js';
import { env } from '../config/env.js';

const KNOWN_PROVIDERS = ['openai', 'twitter', 'brevo', 'opensea', 'magiceden', 'rest'];

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function round(value, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeProvider(value) {
  const provider = normalizeText(value, 'rest').toLowerCase();
  return provider || 'rest';
}

function normalizeCurrency(value) {
  return normalizeText(value, env.apiCosts.defaultCurrency || 'USD').toUpperCase();
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeStatusCode(value) {
  if (value === undefined || value === null || value === '') return null;
  const code = Number(value);
  if (!Number.isFinite(code)) return null;
  const normalized = Math.floor(code);
  if (normalized < 100 || normalized > 999) return null;
  return normalized;
}

function defaultUnitCostUsd(provider) {
  if (provider === 'twitter') return toNumber(env.apiCosts.twitterRequestUsd, 0);
  if (provider === 'brevo') return toNumber(env.apiCosts.brevoEmailUsd, 0);
  if (provider === 'opensea') return toNumber(env.apiCosts.openseaRequestUsd, 0);
  if (provider === 'magiceden') return toNumber(env.apiCosts.magicedenRequestUsd, 0);
  return toNumber(env.apiCosts.genericRequestUsd, 0);
}

function calculateCostUsd(input) {
  if (input.costUsd !== undefined && input.costUsd !== null && input.costUsd !== '') {
    return Math.max(0, toNumber(input.costUsd, 0));
  }

  if (input.providerKey === 'openai') {
    const inputRate = toNumber(env.apiCosts.openAiInputPer1kUsd, 0);
    const outputRate = toNumber(env.apiCosts.openAiOutputPer1kUsd, 0);
    const inputCost = (input.inputTokens / 1000) * inputRate;
    const outputCost = (input.outputTokens / 1000) * outputRate;
    return Math.max(0, inputCost + outputCost);
  }

  const unitCost = Math.max(
    0,
    toNumber(
      input.unitCostUsd,
      defaultUnitCostUsd(input.providerKey)
    )
  );
  return input.requestCount * unitCost;
}

function mapApiUsageRow(row) {
  return {
    id: Number(row.id),
    providerKey: row.provider_key,
    operation: row.operation,
    endpoint: row.endpoint,
    requestCount: Number(row.request_count),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: toNumber(row.cost_usd, 0),
    currency: row.currency,
    success: Boolean(row.success),
    httpStatus: row.http_status === null ? null : Number(row.http_status),
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

function mapAggregateRow(row) {
  return {
    totalCostUsd: toNumber(row.total_cost_usd, 0),
    totalRequests: Number(row.total_requests ?? 0),
    totalInputTokens: Number(row.total_input_tokens ?? 0),
    totalOutputTokens: Number(row.total_output_tokens ?? 0),
    eventsCount: Number(row.events_count ?? 0)
  };
}

export function getApiCostConfig() {
  return {
    defaultCurrency: normalizeCurrency(env.apiCosts.defaultCurrency),
    openAiInputPer1kUsd: toNumber(env.apiCosts.openAiInputPer1kUsd, 0),
    openAiOutputPer1kUsd: toNumber(env.apiCosts.openAiOutputPer1kUsd, 0),
    twitterRequestUsd: toNumber(env.apiCosts.twitterRequestUsd, 0),
    brevoEmailUsd: toNumber(env.apiCosts.brevoEmailUsd, 0),
    openseaRequestUsd: toNumber(env.apiCosts.openseaRequestUsd, 0),
    magicedenRequestUsd: toNumber(env.apiCosts.magicedenRequestUsd, 0),
    genericRequestUsd: toNumber(env.apiCosts.genericRequestUsd, 0)
  };
}

export async function recordApiUsage(input = {}) {
  const providerKey = normalizeProvider(input.providerKey ?? input.provider);
  const operation = normalizeText(input.operation, 'request').slice(0, 120);
  const endpoint = normalizeText(input.endpoint, '').slice(0, 500) || null;
  const requestCount = clampInteger(input.requestCount, 0, 1000000, 1);
  const inputTokens = clampInteger(input.inputTokens, 0, 1000000000, 0);
  const outputTokens = clampInteger(input.outputTokens, 0, 1000000000, 0);
  const currency = normalizeCurrency(input.currency);
  const success = input.success !== false;
  const httpStatus = normalizeStatusCode(input.statusCode ?? input.httpStatus);
  const metadata = normalizeMetadata(input.metadata);
  const costUsd = round(
    calculateCostUsd({
      providerKey,
      requestCount,
      inputTokens,
      outputTokens,
      costUsd: input.costUsd,
      unitCostUsd: input.unitCostUsd
    })
  );

  const result = await pool.query(
    `INSERT INTO api_usage_events (
       provider_key,
       operation,
       endpoint,
       request_count,
       input_tokens,
       output_tokens,
       cost_usd,
       currency,
       success,
       http_status,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING
       id,
       provider_key,
       operation,
       endpoint,
       request_count,
       input_tokens,
       output_tokens,
       cost_usd,
       currency,
       success,
       http_status,
       metadata,
       created_at`,
    [
      providerKey,
      operation,
      endpoint,
      requestCount,
      inputTokens,
      outputTokens,
      costUsd,
      currency,
      success,
      httpStatus,
      JSON.stringify(metadata)
    ]
  );

  return mapApiUsageRow(result.rows[0]);
}

export async function recordApiUsageSafely(input = {}) {
  try {
    return await recordApiUsage(input);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to persist API usage event:', error);
    return null;
  }
}

export async function getApiCostSummary(options = {}) {
  const days = clampInteger(options.days, 1, 365, 30);
  const recentLimit = clampInteger(options.recentLimit, 1, 500, 60);
  const providerLimit = clampInteger(options.providerLimit, 1, 50, 20);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [windowTotalsResult, allTimeTotalsResult, providerBreakdownResult, recentEventsResult] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
         COALESCE(SUM(request_count), 0) AS total_requests,
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COUNT(*)::int AS events_count
       FROM api_usage_events
       WHERE created_at >= $1`,
      [sinceIso]
    ),
    pool.query(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
         COALESCE(SUM(request_count), 0) AS total_requests,
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COUNT(*)::int AS events_count
       FROM api_usage_events`
    ),
    pool.query(
      `SELECT
         provider_key,
         COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
         COALESCE(SUM(request_count), 0) AS total_requests,
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COUNT(*)::int AS events_count,
         MAX(created_at) AS last_event_at
       FROM api_usage_events
       WHERE created_at >= $1
       GROUP BY provider_key
       ORDER BY total_cost_usd DESC, total_requests DESC
       LIMIT $2`,
      [sinceIso, providerLimit]
    ),
    pool.query(
      `SELECT
         id,
         provider_key,
         operation,
         endpoint,
         request_count,
         input_tokens,
         output_tokens,
         cost_usd,
         currency,
         success,
         http_status,
         metadata,
         created_at
       FROM api_usage_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [recentLimit]
    )
  ]);

  const providerRows = providerBreakdownResult.rows.map((row) => ({
    providerKey: row.provider_key,
    totalCostUsd: toNumber(row.total_cost_usd, 0),
    totalRequests: Number(row.total_requests ?? 0),
    totalInputTokens: Number(row.total_input_tokens ?? 0),
    totalOutputTokens: Number(row.total_output_tokens ?? 0),
    eventsCount: Number(row.events_count ?? 0),
    lastEventAt: row.last_event_at
  }));

  return {
    windowDays: days,
    since: sinceIso,
    currency: normalizeCurrency(env.apiCosts.defaultCurrency),
    pricing: getApiCostConfig(),
    knownProviders: KNOWN_PROVIDERS,
    totals: {
      window: mapAggregateRow(windowTotalsResult.rows[0] ?? {}),
      allTime: mapAggregateRow(allTimeTotalsResult.rows[0] ?? {})
    },
    providers: providerRows,
    recentEvents: recentEventsResult.rows.map(mapApiUsageRow)
  };
}
