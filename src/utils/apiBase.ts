/**
 * Central API base URL resolver.
 *
 * - In local dev, falls back to http://localhost:4000 so Vite proxying stays simple.
 * - In Android/iOS builds, prefers platform-specific base URLs when provided.
 * - In web production builds, prefers VITE_API_BASE_URL, then same-origin /api.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const mode = import.meta.env.MODE;

  if (mode === 'android') {
    const configured = import.meta.env.VITE_ANDROID_API_BASE_URL?.trim();
    if (configured) {
      return trimTrailingSlash(configured);
    }
  }

  if (mode === 'ios') {
    const configured = import.meta.env.VITE_IOS_API_BASE_URL?.trim();
    if (configured) {
      return trimTrailingSlash(configured);
    }
  }

  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:4000';
  }

  return '';
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}
