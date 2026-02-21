import { apiRequest } from '../../lib/apiClient';

export { ApiRequestError } from '../../lib/apiClient';

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
  };
  generatedAt: string;
  source: 'ai' | 'fallback';
};

type ApiResponse<T> = {
  data: T;
};

export async function summarizeTweetsWithAi(tweets: AiTweetInput[]) {
  const response = await apiRequest<ApiResponse<TweetSummaryResult>>(
    '/ai/summarize-tweets',
    {
      method: 'POST',
      body: JSON.stringify({ tweets })
    },
    { retries: 1 }
  );
  return response.data;
}

export async function extractMintDetailsWithAi(text: string) {
  const response = await apiRequest<ApiResponse<MintExtractionResult>>(
    '/ai/extract-mint-details',
    {
      method: 'POST',
      body: JSON.stringify({ text })
    },
    { retries: 1 }
  );
  return response.data;
}

export async function generateFarmingTasksWithAi(tweets: AiTweetInput[]) {
  const response = await apiRequest<ApiResponse<FarmingTaskResult>>(
    '/ai/generate-farming-tasks',
    {
      method: 'POST',
      body: JSON.stringify({ tweets })
    },
    { retries: 1 }
  );
  return response.data;
}

export async function fetchDailyProductivitySummaryWithAi() {
  const response = await apiRequest<ApiResponse<DailyProductivitySummaryResult>>(
    '/ai/daily-productivity-summary',
    undefined,
    { retries: 1 }
  );
  return response.data;
}
