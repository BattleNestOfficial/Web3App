import { ApiRequestError, apiRequest } from '../../lib/apiClient';

type ApiResponse<T> = {
  data: T;
  meta: MarketplaceMintCalendarMeta;
};

export type MarketplaceMintItem = {
  id: string;
  source: 'magiceden' | 'opensea' | string;
  sourceLabel: string;
  name: string;
  chain: string;
  startsAt: string;
  endsAt: string | null;
  url: string | null;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  supply: number | null;
  contractAddress: string | null;
  stageLabel: string;
};

export type MarketplaceMintCalendarMeta = {
  fetchedAt: string;
  days: number;
  limit: number;
  providers: {
    magiceden: {
      ok: boolean;
      count: number;
      error: string | null;
    };
    opensea: {
      ok: boolean;
      count: number;
      error: string | null;
    };
  };
};

export async function fetchUpcomingMarketplaceMints(params?: { limit?: number; days?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(params.limit)));
    query.set('limit', String(safeLimit));
  }
  if (params?.days) query.set('days', String(params.days));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  try {
    const response = await apiRequest<ApiResponse<MarketplaceMintItem[]>>(
      `/marketplace-mints/upcoming${suffix}`,
      undefined,
      { retries: 1 }
    );
    return response;
  } catch (error) {
    const shouldRetryWithoutLimit =
      params?.limit !== undefined &&
      error instanceof ApiRequestError &&
      error.status === 400 &&
      String(error.message).toLowerCase().includes('limit');

    if (!shouldRetryWithoutLimit) {
      throw error;
    }

    const fallbackQuery = new URLSearchParams();
    if (params?.days) fallbackQuery.set('days', String(params.days));
    const fallbackSuffix = fallbackQuery.toString() ? `?${fallbackQuery.toString()}` : '';
    const fallbackResponse = await apiRequest<ApiResponse<MarketplaceMintItem[]>>(
      `/marketplace-mints/upcoming${fallbackSuffix}`,
      undefined,
      { retries: 1 }
    );
    return fallbackResponse;
  }
}
