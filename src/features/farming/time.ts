export function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function parseOptionalDateInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const timestamp = new Date(normalized).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error('Please select a valid claim reminder date.');
  }
  return timestamp;
}

export function formatCountdown(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs;

  if (diff <= 0) {
    return 'Due now';
  }

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);

  const segments = [
    days > 0 ? `${days}d` : null,
    `${hours.toString().padStart(2, '0')}h`,
    `${minutes.toString().padStart(2, '0')}m`,
    `${seconds.toString().padStart(2, '0')}s`
  ].filter(Boolean);

  return segments.join(' ');
}
