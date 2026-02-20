function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
  const fallback = 'http://localhost:4000/api';
  const base = configured || fallback;
  const normalized = trimTrailingSlash(base);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

