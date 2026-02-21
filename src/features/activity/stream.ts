import type { AppActivityEvent, AppActivitySource } from './log';
import type { MintRecord } from '../mints/db';
import type { WalletActivityEvent } from '../walletTracker/api';

export type TrackedActivityKind = 'minted_nft' | 'sold_nft' | 'entered_whitelist' | 'app_activity';

export type TrackedActivityEntry = {
  id: string;
  kind: TrackedActivityKind;
  happenedAt: number;
  title: string;
  detail: string;
  source: AppActivitySource;
};

export type TrackedActivitySummary = {
  total: number;
  mintedNftCount: number;
  soldNftCount: number;
  enteredWhitelistCount: number;
  appActivityCount: number;
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function shortAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function sourceLabel(source: AppActivitySource) {
  if (source === 'wallet_tracker') return 'Wallet Tracker';
  if (source === 'mint_tracker') return 'Mint Tracker';
  if (source === 'todo') return 'To-Do';
  if (source === 'productivity') return 'Productivity';
  if (source === 'analytics') return 'Analytics';
  if (source === 'farming') return 'Farming';
  return 'Bug Tracker';
}

function fromWalletEvent(event: WalletActivityEvent): TrackedActivityEntry | null {
  const type = normalizeText(event.event_type).toLowerCase();
  if (type !== 'mint' && type !== 'sell') {
    return null;
  }

  const happenedAt = new Date(event.event_at).getTime();
  if (!Number.isFinite(happenedAt)) return null;

  const contract = normalizeText(event.token_contract).toLowerCase();
  const tokenId = normalizeText(event.token_id);
  const collection = normalizeText(event.collection_slug) || (contract ? shortAddress(contract) : 'Unknown collection');
  const tokenLabel = tokenId ? `#${tokenId}` : '';
  const marketLabel = normalizeText(event.marketplace).toUpperCase() || 'MARKETPLACE';

  if (type === 'mint') {
    return {
      id: `wallet-mint-${event.event_id || `${contract}:${tokenId}:${happenedAt}`}`,
      kind: 'minted_nft',
      happenedAt,
      title: 'Minted NFT',
      detail: `${collection} ${tokenLabel} | ${marketLabel}`.trim(),
      source: 'wallet_tracker'
    };
  }

  return {
    id: `wallet-sell-${event.event_id || `${contract}:${tokenId}:${happenedAt}`}`,
    kind: 'sold_nft',
    happenedAt,
    title: 'Sold NFT',
    detail: `${collection} ${tokenLabel} | ${marketLabel}`.trim(),
    source: 'wallet_tracker'
  };
}

function fromWhitelistMint(mint: MintRecord): TrackedActivityEntry | null {
  if (mint.deletedAt !== null || mint.visibility !== 'whitelist') {
    return null;
  }

  const happenedAt = Number.isFinite(mint.updatedAt) ? mint.updatedAt : mint.createdAt;
  if (!Number.isFinite(happenedAt)) return null;

  return {
    id: `wl-${mint.clientId}`,
    kind: 'entered_whitelist',
    happenedAt,
    title: 'Entered Whitelist',
    detail: `${mint.name} | ${mint.chain}`,
    source: 'mint_tracker'
  };
}

function fromAppEvent(event: AppActivityEvent): TrackedActivityEntry | null {
  const happenedAt = Number(event.happenedAt);
  if (!Number.isFinite(happenedAt)) return null;

  const action = normalizeText(event.action).toLowerCase();
  const titleText = normalizeText(event.title).toLowerCase();
  if (action === 'view_page' || action === 'page_view' || titleText === 'page viewed') {
    return null;
  }

  const title = normalizeText(event.title) || 'Activity';
  const detail = normalizeText(event.detail);
  const source = sourceLabel(event.source);

  return {
    id: `app-${event.eventId || event.id || `${event.source}-${happenedAt}`}`,
    kind: 'app_activity',
    happenedAt,
    title,
    detail: detail ? `${detail} | ${source}` : source,
    source: event.source
  };
}

export function buildTrackedActivityEntries(
  walletEvents: WalletActivityEvent[],
  mints: MintRecord[],
  appEvents: AppActivityEvent[],
  limit = 100
): TrackedActivityEntry[] {
  const walletEntries = walletEvents.map(fromWalletEvent).filter((entry): entry is TrackedActivityEntry => entry !== null);
  const whitelistEntries = mints
    .map(fromWhitelistMint)
    .filter((entry): entry is TrackedActivityEntry => entry !== null);
  const appEntries = appEvents.map(fromAppEvent).filter((entry): entry is TrackedActivityEntry => entry !== null);

  const dedupe = new Map<string, TrackedActivityEntry>();
  for (const entry of [...walletEntries, ...whitelistEntries, ...appEntries]) {
    dedupe.set(entry.id, entry);
  }

  return [...dedupe.values()]
    .sort((a, b) => b.happenedAt - a.happenedAt)
    .slice(0, Math.max(1, limit));
}

export function summarizeTrackedActivities(entries: TrackedActivityEntry[]): TrackedActivitySummary {
  let mintedNftCount = 0;
  let soldNftCount = 0;
  let enteredWhitelistCount = 0;
  let appActivityCount = 0;

  for (const entry of entries) {
    if (entry.kind === 'minted_nft') mintedNftCount += 1;
    if (entry.kind === 'sold_nft') soldNftCount += 1;
    if (entry.kind === 'entered_whitelist') enteredWhitelistCount += 1;
    if (entry.kind === 'app_activity') appActivityCount += 1;
  }

  return {
    total: entries.length,
    mintedNftCount,
    soldNftCount,
    enteredWhitelistCount,
    appActivityCount
  };
}
