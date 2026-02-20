import { apiRequest } from '../../lib/apiClient';

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

export async function fetchNftPortfolioAnalytics(params?: { holdingsLimit?: number }) {
  const query = new URLSearchParams();
  if (params?.holdingsLimit) query.set('holdingsLimit', String(params.holdingsLimit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiRequest<ApiResponse<PortfolioAnalytics>>(`/analytics/nft-portfolio${suffix}`, undefined, {
    retries: 1
  });
  return response.data;
}
