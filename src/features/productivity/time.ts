export function toDateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export function parseOptionalDateInput(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;

  const timestamp = new Date(normalized).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error('Please select a valid due date.');
  }
  return timestamp;
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

export function formatDueLabel(timestamp: number, now: number) {
  if (timestamp <= now) return 'Overdue';
  const diff = timestamp - now;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m left`;
}
