import { apiRequest } from '../../lib/apiClient';
import { recordAppActivity } from '../activity/log';

type ApiResponse<T> = {
  data: T;
};

export type TwitterTracker = {
  id: number;
  handle: string;
  display_label: string | null;
  enabled: boolean;
  last_checked_at: string | null;
  last_tweet_at: string | null;
  last_tweet_id: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
};

export type TwitterMessage = {
  id: number;
  tracker_id: number;
  tweet_id: string;
  tweet_text: string;
  tweet_url: string | null;
  tweeted_at: string;
  author_handle: string;
  created_at: string;
  handle: string;
  display_label: string | null;
};

export type TwitterTrackerPayload = {
  handle: string;
  displayLabel?: string;
  enabled?: boolean;
};

export async function fetchTwitterTrackers() {
  const response = await apiRequest<ApiResponse<TwitterTracker[]>>('/twitter-trackers', undefined, { retries: 1 });
  return response.data;
}

export async function createTwitterTracker(payload: TwitterTrackerPayload) {
  const response = await apiRequest<ApiResponse<TwitterTracker>>(
    '/twitter-trackers',
    {
      method: 'POST',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  await recordAppActivity({
    source: 'twitter_tracker',
    action: 'create_tracker',
    title: 'Twitter tracker added',
    detail: `@${response.data.handle}`
  });
  return response.data;
}

export async function updateTwitterTracker(id: number, payload: TwitterTrackerPayload) {
  const response = await apiRequest<ApiResponse<TwitterTracker>>(
    `/twitter-trackers/${id}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    { retries: 1 }
  );
  await recordAppActivity({
    source: 'twitter_tracker',
    action: 'update_tracker',
    title: 'Twitter tracker updated',
    detail: `@${response.data.handle}`
  });
  return response.data;
}

export async function deleteTwitterTracker(id: number) {
  await apiRequest<void>(`/twitter-trackers/${id}`, { method: 'DELETE' }, { retries: 1 });
  await recordAppActivity({
    source: 'twitter_tracker',
    action: 'delete_tracker',
    title: 'Twitter tracker deleted',
    detail: `Tracker #${id}`
  });
}

export async function fetchTwitterMessages(params?: { trackerId?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.trackerId) query.set('trackerId', String(params.trackerId));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';

  const response = await apiRequest<ApiResponse<TwitterMessage[]>>(`/twitter-trackers/messages${suffix}`, undefined, {
    retries: 1
  });
  return response.data;
}

export async function syncTwitterTrackers(trackerId?: number) {
  const response = await apiRequest<ApiResponse<unknown>>(
    '/twitter-trackers/sync',
    {
      method: 'POST',
      body: JSON.stringify(trackerId ? { trackerId } : {})
    },
    { retries: 0 }
  );
  await recordAppActivity({
    source: 'twitter_tracker',
    action: 'manual_sync',
    title: 'Twitter tracker sync triggered',
    detail: trackerId ? `Tracker #${trackerId}` : 'All trackers'
  });
  return response.data;
}

