import { auth } from '../../lib/firebase';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

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

export class ApiRequestError extends Error {
  status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiRequestError('Authentication required to load alpha feed.', 401);
  }
  return user.getIdToken();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiRequestError('You are offline.', 0);
  }

  const token = await getAuthToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {})
      }
    });
  } catch {
    throw new ApiRequestError('Network error while contacting backend.', 0);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // Ignore JSON parse errors for non-JSON responses.
    }
    throw new ApiRequestError(message, response.status);
  }

  return (await response.json()) as T;
}

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
  return request<AlphaFeedResponse>(`/alpha-feed${query}`);
}

export async function syncAlphaFeed(params: {
  accounts?: string[];
  keywords?: string[];
  limit?: number;
}) {
  return request<AlphaFeedResponse>('/alpha-feed/sync', {
    method: 'POST',
    body: JSON.stringify({
      accounts: params.accounts ?? [],
      keywords: params.keywords ?? [],
      limit: params.limit
    })
  });
}
