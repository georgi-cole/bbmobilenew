/**
 * useBackgroundTheme.ts
 *
 * React hook that resolves and exposes the dynamic background theme.
 *
 * Usage:
 *   const { url, key, reason } = useBackgroundTheme();
 *
 * When attachToRoot is true the resolved URL is written to the CSS custom
 * property --intro-bg-image on <html> (documentElement) so global styles can consume it.
 */
import { useState, useEffect } from 'react';
import { ASSETS_BASE, DEFAULT_FILE, resolveTheme } from '../utils/backgroundTheme';
import type { ResolvedTheme, ThemeKey } from '../utils/backgroundTheme';
import { preloadImage } from '../utils/preload';

interface BackgroundState {
  url: string | null;
  key: ThemeKey | null;
  reason: string | null;
}

interface UseBackgroundThemeOptions {
  attachToRoot?: boolean;
}

function normalizeBackgroundUrl(url: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return base && url.startsWith('/') && !url.startsWith(`${base}/`)
    ? `${base}${url}`
    : url;
}

function getBootstrapBackgroundState(): BackgroundState {
  return {
    url: normalizeBackgroundUrl(`${ASSETS_BASE}${DEFAULT_FILE}`),
    key: null,
    reason: 'boot-fallback',
  };
}

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {},
): BackgroundState {
  const [state, setState] = useState<BackgroundState>(() => getBootstrapBackgroundState());

  const { attachToRoot } = opts;

  useEffect(() => {
    let cancelled = false;
    const bootstrap = getBootstrapBackgroundState();

    if (attachToRoot) {
      document.documentElement.style.setProperty(
        '--intro-bg-image',
        `url("${bootstrap.url}")`,
      );
    }

    resolveTheme()
      .then((resolved: ResolvedTheme) => {
        if (cancelled) return;

        const normalized = normalizeBackgroundUrl(resolved.url);

        // Apply the background immediately so consumers don't wait on image preload.
        setState({ url: normalized, key: resolved.key, reason: resolved.reason });
        console.info('[useBackgroundTheme] background applied:', resolved.key, normalized, `(${resolved.reason})`);

        if (attachToRoot) {
          document.documentElement.style.setProperty(
            '--intro-bg-image',
            `url("${normalized}")`,
          );
        }

        // Preload the background image in parallel so it's in cache when used,
        // but do not gate state updates on this completing.
        preloadImage(normalized).then(() => {
          if (cancelled) return;
          // Optional: could add debug logging here if desired.
        });
      })
      .catch((error) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('[useBackgroundTheme] failed to resolve dynamic theme, keeping bootstrap background', error);
        }
      });

    return () => {
      cancelled = true;
      if (attachToRoot) {
        document.documentElement.style.removeProperty('--intro-bg-image');
      }
    };
  }, [attachToRoot]);

  return state;
}
