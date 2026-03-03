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
import { resolveTheme } from '../utils/backgroundTheme';
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

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {},
): BackgroundState {
  const [state, setState] = useState<BackgroundState>({
    url: null,
    key: null,
    reason: null,
  });

  const { attachToRoot } = opts;

  useEffect(() => {
    let cancelled = false;

    resolveTheme().then((resolved: ResolvedTheme) => {
      if (cancelled) return;

      // Normalize URL to work on GitHub Pages where BASE_URL may be '/bbmobilenew/'.
      // Avoid double-prefixing if backgroundTheme already includes the base.
      const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
      const normalized = (base && resolved.url.startsWith('/') && !resolved.url.startsWith(`${base}/`))
        ? `${base}${resolved.url}`
        : resolved.url;

      // Preload the background image before setting state so consumers get
      // background-first behaviour (image is in cache when the URL is used).
      preloadImage(normalized).then(() => {
        if (cancelled) return;
        setState({ url: normalized, key: resolved.key, reason: resolved.reason });
        console.info('[useBackgroundTheme] background applied:', resolved.key, normalized, `(${resolved.reason})`);

        if (attachToRoot) {
          document.documentElement.style.setProperty(
            '--intro-bg-image',
            `url("${normalized}")`,
          );
        }
      });
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
