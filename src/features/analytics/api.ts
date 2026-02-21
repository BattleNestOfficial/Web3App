import { apiRequest } from '../../lib/apiClient';
import { recordAppActivity } from '../activity/log';

type ApiResponse<T> = {
  data: T;
};

export type CurrencyAmount = {
  currency: string;
  amount: number;
};

export type PortfolioHolding = {
  tokenContract: string;
  tokenId: string;
  collectionId: string;
  chain: string;
  quantity: number;
  currency: string;
  costBasisNative: number;
  avgCostNative: number;
  livePriceNative: number | null;
  livePriceUsd: number | null;
  currentValueNative: number | null;
  unrealizedPnlNative: number | null;
  livePriceAsOf: string | null;
  livePriceSource: string | null;
};

export type PortfolioAnalytics = {
  summary: {
    trackedWallets: number;
    activeTrackers: number;
    totalEvents: number;
    mintedNfts: number;
    holdingsCount: number;
    realizedPnl: CurrencyAmount[];
    unrealizedPnl: CurrencyAmount[];
    estimatedValue: CurrencyAmount[];
  };
  holdings: PortfolioHolding[];
  meta: {
    fetchedAt: string;
    holdingsLimit: number;
    priceCollectionsRequested: number;
    priceCollectionsResolved: number;
    priceErrors: Array<{
      collectionId: string;
      chain: string;
      error: string;
    }>;
  };
};

export type ApiCostPricing = {
  defaultCurrency: string;
  openAiInputPer1kUsd: number;
  openAiOutputPer1kUsd: number;
  brevoEmailUsd: number;
  openseaRequestUsd: number;
  magicedenRequestUsd: number;
  genericRequestUsd: number;
};

export type ApiCostTotals = {
  totalCostUsd: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  eventsCount: number;
};

export type ApiCostProviderRow = {
  providerKey: string;
  totalCostUsd: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  eventsCount: number;
  lastEventAt: string | null;
};

export type ApiCostEvent = {
  id: number;
  providerKey: string;
  operation: string;
  endpoint: string | null;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  currency: string;
  success: boolean;
  httpStatus: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ApiCostSummary = {
  windowDays: number;
  since: string;
  currency: string;
  pricing: ApiCostPricing;
  knownProviders: string[];
  totals: {
    window: ApiCostTotals;
    allTime: ApiCostTotals;
  };
  providers: ApiCostProviderRow[];
  recentEvents: ApiCostEvent[];
};

export async function fetchNftPortfolioAnalytics(params?: { holdingsLimit?: number }) {
  const query = new URLSearchParams();
  if (params?.holdingsLimit) query.set('holdingsLimit', String(params.holdingsLimit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiRequest<ApiResponse<PortfolioAnalytics>>(`/analytics/nft-portfolio${suffix}`, undefined, {
    retries: 1
  });
  return response.data;
}

export async function fetchApiCostSummary(params?: { days?: number; recentLimit?: number; providerLimit?: number }) {
  const query = new URLSearchParams();
  if (params?.days) query.set('days', String(params.days));
  if (params?.recentLimit) query.set('recentLimit', String(params.recentLimit));
  if (params?.providerLimit) query.set('providerLimit', String(params.providerLimit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiRequest<ApiResponse<ApiCostSummary>>(`/analytics/api-costs${suffix}`, undefined, {
    retries: 1
  });
  return response.data;
}

export async function createApiCostEvent(payload: {
  providerKey?: string;
  operation?: string;
  endpoint?: string | null;
  requestCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  currency?: string;
  success?: boolean;
  statusCode?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const response = await apiRequest<ApiResponse<ApiCostEvent>>(
    '/analytics/api-costs/events',
    {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    },
    { retries: 1 }
  );
  await recordAppActivity({
    source: 'analytics',
    action: 'log_api_cost',
    title: 'API cost event logged',
    detail: `${response.data.providerKey} | ${response.data.operation} | $${response.data.costUsd}`
  });
  return response.data;
}
