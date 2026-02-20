export function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string) {
  const timestamp = new Date(`${dateKey}T00:00:00`).getTime();
  if (Number.isNaN(timestamp)) return dateKey;
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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

export function parseTagsInput(value: string) {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function hasContent(html: string) {
  const plainText = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.length > 0;
}
