import { env } from '../config/env.js';
import { syncAllTwitterTrackers } from '../services/twitterTrackerService.js';

const MIN_INTERVAL_MS = 15 * 1000;

let timer = null;
let running = false;

async function runSync() {
  if (running) return;
  running = true;

  try {
    const result = await syncAllTwitterTrackers();
    const insertedTotal = result.runs
      .filter((run) => run.status === 'ok')
      .reduce((acc, run) => acc + Number(run.inserted || 0), 0);

    if (insertedTotal > 0) {
      // eslint-disable-next-line no-console
      console.log(`[twitter-cron] Inserted ${insertedTotal} new tweet message(s).`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[twitter-cron] Twitter sync failed:', error);
  } finally {
    running = false;
  }
}

export function startTwitterTrackerCron() {
  if (!env.twitterTracker.enabled) {
    // eslint-disable-next-line no-console
    console.log('[twitter-cron] Disabled by TWITTER_TRACKER_ENABLED=false');
    return () => undefined;
  }

  if (timer) return () => undefined;

  const configuredIntervalMs = (Number(env.twitterTracker.pollIntervalSeconds) || 60) * 1000;
  const intervalMs = Math.max(MIN_INTERVAL_MS, configuredIntervalMs);

  // eslint-disable-next-line no-console
  console.log(`[twitter-cron] Started (every ${Math.floor(intervalMs / 1000)}s)`);
  void runSync();

  timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  return () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // eslint-disable-next-line no-console
    console.log('[twitter-cron] Stopped');
  };
}

