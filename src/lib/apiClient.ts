import { auth } from './firebase';
import { resolveApiBaseUrl } from './apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

export class ApiRequestError extends Error {
  status: number | null;
  requestId: string | null;
  details: unknown;

  constructor(message: string, status: number | null = null, requestId: string | null = null, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

type RequestOptions = {
  requiresAuth?: boolean;
  retries?: number;
};

type BackendErrorBody = {
  error?: {
    message?: string;
    requestId?: string;
    details?: unknown;
  };
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}

async function getAuthToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiRequestError('Authentication required.', 401);
  }
  return user.getIdToken(forceRefresh);
}

async function parseBackendError(response: Response) {
  const requestIdFromHeader = response.headers.get('x-request-id');
  let message = `Request failed with status ${response.status}`;
  let details: unknown;
  let requestId = requestIdFromHeader;

  try {
    const body = (await response.json()) as BackendErrorBody;
    message = body.error?.message ?? message;
    requestId = body.error?.requestId ?? requestIdFromHeader;
    details = body.error?.details;
  } catch {
    // Ignore JSON parse failures and keep generic message.
  }

  return new ApiRequestError(message, response.status, requestId, details);
}

export async function apiRequest<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiRequestError('You are offline.', 0);
  }

  const requiresAuth = options?.requiresAuth ?? true;
  const retries = Math.max(0, options?.retries ?? 1);
  const requestId = createRequestId();

  let token = '';
  if (requiresAuth) {
    token = await getAuthToken();
  }

  let attempt = 0;
  while (attempt <= retries) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
          ...(requiresAuth ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {})
        }
      });

      if (response.status === 401 && requiresAuth && attempt < retries) {
        token = await getAuthToken(true);
        attempt += 1;
        continue;
      }

      if (!response.ok) {
        const shouldRetry = [429, 502, 503, 504].includes(response.status) && attempt < retries;
        if (shouldRetry) {
          attempt += 1;
          await sleep(300 * 2 ** (attempt - 1));
          continue;
        }
        throw await parseBackendError(response);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw error;
      }

      if (attempt >= retries) {
        throw new ApiRequestError(
          `Network error while contacting backend (${API_BASE_URL}). Check VITE_API_BASE_URL and backend availability.`,
          0,
          requestId
        );
      }

      attempt += 1;
      await sleep(300 * 2 ** (attempt - 1));
    }
  }

  throw new ApiRequestError('Request failed unexpectedly.', 500, requestId);
}
