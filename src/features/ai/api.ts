import { auth } from '../../lib/firebase';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

export type AiTweetInput = {
  text: string;
  authorUsername?: string;
};

export type TweetSummaryResult = {
  summary: string;
  highlights: string[];
};

export type MintExtractionResult = {
  projectName: string | null;
  chain: string;
  mintDate: string | null;
  mintType: 'whitelist' | 'public' | 'unknown';
  links: string[];
  confidence: number;
  notes: string;
};

export type FarmingTaskResult = {
  tasks: Array<{
    title: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  }>;
};

export type DailyProductivitySummaryResult = {
  summary: string;
  focusItems: string[];
  riskItems: string[];
  metrics: {
    mintsUpcoming24h: number;
    remindersDue24h: number;
    farmingProjects: number;
    farmingAvgProgress: number;
    farmingClaimsDue24h: number;
    alphaTweets24h: number;
  };
  generatedAt: string;
  source: 'ai' | 'fallback';
};

type ApiResponse<T> = {
  data: T;
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
    throw new ApiRequestError('Authentication required to use AI features.', 401);
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
      // Ignore JSON parsing errors.
    }
    throw new ApiRequestError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function summarizeTweetsWithAi(tweets: AiTweetInput[]) {
  const response = await request<ApiResponse<TweetSummaryResult>>('/ai/summarize-tweets', {
    method: 'POST',
    body: JSON.stringify({ tweets })
  });
  return response.data;
}

export async function extractMintDetailsWithAi(text: string) {
  const response = await request<ApiResponse<MintExtractionResult>>('/ai/extract-mint-details', {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  return response.data;
}

export async function generateFarmingTasksWithAi(tweets: AiTweetInput[]) {
  const response = await request<ApiResponse<FarmingTaskResult>>('/ai/generate-farming-tasks', {
    method: 'POST',
    body: JSON.stringify({ tweets })
  });
  return response.data;
}

export async function fetchDailyProductivitySummaryWithAi() {
  const response = await request<ApiResponse<DailyProductivitySummaryResult>>('/ai/daily-productivity-summary');
  return response.data;
}
