import { apiRequest } from '../../lib/apiClient';

type ApiResponse<T> = {
  data: T;
};

export type AutomationBillingSummary = {
  payPerUseEnabled: boolean;
  account: {
    accountKey: string;
    currency: string;
    balanceCents: number;
    spentCents: number;
    lastChargedAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  pricing: {
    dailyBriefingCents: number;
    todoDailyDigestCents: number;
    missedTaskAlertCents: number;
    inactiveFarmingAlertCents: number;
    weeklyReportCents: number;
  };
  totals: {
    chargedRuns: number;
    blockedRuns: number;
    revertedRuns: number;
    totalChargedCents: number;
  };
  recentUsage: Array<{
    id: number;
    workflow_key: string;
    run_key: string;
    status: string;
    price_cents: number;
    currency: string;
    created_at: string;
  }>;
  recentTransactions: Array<{
    id: number;
    kind: string;
    amount_cents: number;
    balance_after_cents: number;
    currency: string;
    workflow_key: string | null;
    run_key: string | null;
    created_at: string;
  }>;
};

export async function fetchAutomationBillingSummary(params?: { usageLimit?: number; transactionLimit?: number }) {
  const query = new URLSearchParams();
  if (params?.usageLimit) query.set('usageLimit', String(params.usageLimit));
  if (params?.transactionLimit) query.set('transactionLimit', String(params.transactionLimit));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const response = await apiRequest<ApiResponse<AutomationBillingSummary>>(`/automation/billing${suffix}`, undefined, {
    retries: 1
  });
  return response.data;
}

