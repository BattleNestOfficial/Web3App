function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function resolveApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL ?? '').trim();
  let base = configured;

  if (!base) {
    if (typeof window !== 'undefined') {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      base = isLocalhost ? 'http://localhost:4000' : window.location.origin;
    } else {
      base = 'http://localhost:4000';
    }
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && base.startsWith('http://')) {
    try {
      const parsed = new URL(base);
      const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (!isLocal) {
        parsed.protocol = 'https:';
        base = parsed.toString();
      }
    } catch {
      // Keep configured value unchanged if URL parsing fails.
    }
  }

  const normalized = trimTrailingSlash(base);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}
