import { env } from '../config/env.js';
import { syncAllWalletTrackers } from '../services/walletTrackerService.js';

const MIN_INTERVAL_MS = 15 * 1000;

let timer = null;
let running = false;

async function runSync() {
  if (running) return;
  running = true;

  try {
    const result = await syncAllWalletTrackers();
    const insertedTotal = result.runs
      .filter((run) => run.status === 'ok')
      .reduce((acc, run) => acc + Number(run.inserted || 0), 0);

    if (insertedTotal > 0) {
      // eslint-disable-next-line no-console
      console.log(`[wallet-cron] Inserted ${insertedTotal} wallet event(s).`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[wallet-cron] Wallet sync failed:', error);
  } finally {
    running = false;
  }
}

export function startWalletTrackerCron() {
  if (!env.walletTracker.enabled) {
    // eslint-disable-next-line no-console
    console.log('[wallet-cron] Disabled by WALLET_TRACKER_ENABLED=false');
    return () => undefined;
  }

  if (timer) return () => undefined;

  const configuredIntervalMs = (Number(env.walletTracker.pollIntervalSeconds) || 60) * 1000;
  const intervalMs = Math.max(MIN_INTERVAL_MS, configuredIntervalMs);

  // eslint-disable-next-line no-console
  console.log(`[wallet-cron] Started (every ${Math.floor(intervalMs / 1000)}s)`);
  void runSync();

  timer = setInterval(() => {
    void runSync();
  }, intervalMs);

  return () => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // eslint-disable-next-line no-console
    console.log('[wallet-cron] Stopped');
  };
}
