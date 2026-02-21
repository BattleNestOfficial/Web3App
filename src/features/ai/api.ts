import { apiRequest } from '../../lib/apiClient';

export { ApiRequestError } from '../../lib/apiClient';

export type MintExtractionResult = {
  projectName: string | null;
  chain: string;
  mintDate: string | null;
  mintType: 'whitelist' | 'public' | 'unknown';
  links: string[];
  confidence: number;
  notes: string;
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

export async function fetchDailyProductivitySummaryWithAi() {
  const response = await apiRequest<ApiResponse<DailyProductivitySummaryResult>>(
    '/ai/daily-productivity-summary',
    undefined,
    { retries: 1 }
  );
  return response.data;
}
