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
      setState({ url: resolved.url, key: resolved.key, reason: resolved.reason });
      console.info('[useBackgroundTheme] background applied:', resolved.key, resolved.url, `(${resolved.reason})`);

      if (attachToRoot) {
        document.documentElement.style.setProperty(
          '--intro-bg-image',
          `url("${resolved.url}")`,
        );
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
