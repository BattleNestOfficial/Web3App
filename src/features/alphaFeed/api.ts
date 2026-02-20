import { apiRequest } from '../../lib/apiClient';

export { ApiRequestError } from '../../lib/apiClient';

export type AlphaTweet = {
  id: number;
  tweetId: string;
  authorId: string | null;
  authorUsername: string;
  text: string;
  url: string;
  matchedKeywords: string[];
  tweetedAt: string;
  fetchedAt: string;
};

export type AlphaFeedSyncMeta = {
  fetchedCount: number;
  storedCount: number;
  selectedAccounts: string[];
  selectedKeywords: string[];
  warnings: string[];
  errors: string[];
} | null;

export type AlphaFeedMeta = {
  selectedAccounts: string[];
  selectedKeywords: string[];
  configuredAccounts: string[];
  configuredKeywords: string[];
  lastFetchedAt: string | null;
  totalCount: number;
  sync: AlphaFeedSyncMeta;
};

type AlphaFeedResponse = {
  data: AlphaTweet[];
  meta: AlphaFeedMeta;
};

function toQuery(params: { accounts?: string[]; keywords?: string[]; limit?: number; refresh?: boolean }) {
  const search = new URLSearchParams();
  if (params.accounts && params.accounts.length > 0) {
    search.set('accounts', params.accounts.join(','));
  }
  if (params.keywords && params.keywords.length > 0) {
    search.set('keywords', params.keywords.join(','));
  }
  if (typeof params.limit === 'number') {
    search.set('limit', String(params.limit));
  }
  if (params.refresh) {
    search.set('refresh', 'true');
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function fetchAlphaFeed(params: {
  accounts?: string[];
  keywords?: string[];
  limit?: number;
  refresh?: boolean;
}) {
  const query = toQuery(params);
  return apiRequest<AlphaFeedResponse>(`/alpha-feed${query}`, undefined, { retries: 1 });
}

export async function syncAlphaFeed(params: {
  accounts?: string[];
  keywords?: string[];
  limit?: number;
}) {
  return apiRequest<AlphaFeedResponse>(
    '/alpha-feed/sync',
    {
      method: 'POST',
      body: JSON.stringify({
        accounts: params.accounts ?? [],
        keywords: params.keywords ?? [],
        limit: params.limit
      })
    },
    { retries: 1 }
  );
}
