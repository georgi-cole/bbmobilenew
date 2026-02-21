/**
 * useBackgroundTheme.ts
 *
 * React hook that resolves and exposes the dynamic background theme.
 *
 * Usage:
 *   const { url, key, reason } = useBackgroundTheme();
 *
 * When attachToBody is true the resolved URL is written to the CSS custom
 * property --intro-bg-image on <body> so global styles can consume it.
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
  attachToBody?: boolean;
}

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {},
): BackgroundState {
  const [state, setState] = useState<BackgroundState>({
    url: null,
    key: null,
    reason: null,
  });

  const { attachToBody } = opts;

  useEffect(() => {
    let cancelled = false;

    resolveTheme().then((resolved: ResolvedTheme) => {
      if (cancelled) return;
      setState({ url: resolved.url, key: resolved.key, reason: resolved.reason });

      if (attachToBody) {
        document.body.style.setProperty(
          '--intro-bg-image',
          `url("${resolved.url}")`,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [attachToBody]);

  return state;
}
