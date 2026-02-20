import { apiRequest } from '../../lib/apiClient';

type ApiResponse<T> = {
  data: T;
};

export type WalletTracker = {
  id: number;
  wallet_address: string;
  wallet_label: string | null;
  platform: string;
  notify_buy: boolean;
  notify_sell: boolean;
  notify_mint: boolean;
  enabled: boolean;
  last_checked_at: string | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
  event_count?: number;
};

export type WalletActivityEvent = {
  id: number;
  tracker_id: number;
  event_id: string;
  event_type: 'buy' | 'sell' | 'mint' | 'transfer';
  tx_hash: string | null;
  token_contract: string | null;
  token_id: string | null;
  collection_slug: string | null;
  currency_symbol: string | null;
  price_value: string | null;
  from_wallet: string | null;
  to_wallet: string | null;
  event_at: string;
  marketplace: string;
  created_at: string;
  wallet_address: string;
  wallet_label: string | null;
};

export type WalletTrackerPayload = {
  walletAddress: string;
  platform?: 'opensea' | 'magiceden';
  walletLabel?: string;
  enabled?: boolean;
  notifyBuy?: boolean;
  notifySell?: boolean;
  notifyMint?: boolean;
};

export async function fetchWalletTrackers() {
  const response = await apiRequest<ApiResponse<WalletTracker[]>>('/wallet-trackers', undefined, { retries: 1 });
  return response.data;
}

export async function createWalletTracker(payload: WalletTrackerPayload) {
  const response = await apiRequest<ApiResponse<WalletTracker>>(
    '/wallet-trackers',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return response.data;
}

export async function updateWalletTracker(id: number, payload: WalletTrackerPayload) {
  const response = await apiRequest<ApiResponse<WalletTracker>>(
    `/wallet-trackers/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  return response.data;
}

export async function deleteWalletTracker(id: number) {
  await apiRequest<void>(`/wallet-trackers/${id}`, { method: 'DELETE' }, { retries: 1 });
}

export async function fetchWalletActivityEvents(params?: { trackerId?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.trackerId) query.set('trackerId', String(params.trackerId));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const response = await apiRequest<ApiResponse<WalletActivityEvent[]>>(
    `/wallet-trackers/events${suffix}`,
    undefined,
    { retries: 1 }
  );
  return response.data;
}

export async function syncWalletTrackers(trackerId?: number) {
  const response = await apiRequest<ApiResponse<unknown>>(
    '/wallet-trackers/sync',
    {
      method: 'POST',
      body: JSON.stringify(trackerId ? { trackerId } : {})
    },
    { retries: 0 }
  );
  return response.data;
}
