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
import { getBinaryFallbackKey, resolveSkinAsset } from '../utils/skinAssets';
import { preloadImage } from '../utils/preload';

interface BackgroundState {
  url: string | null;
  key: ThemeKey | null;
  reason: string | null;
}

interface UseBackgroundThemeOptions {
  attachToRoot?: boolean;
}

function resolveInitialBackground(): BackgroundState {
  const fallbackKey = getBinaryFallbackKey(new Date());
  const fallbackAsset = resolveSkinAsset(fallbackKey);

  return {
    url: fallbackAsset.url,
    key: fallbackAsset.key,
    reason: 'fallback:initial-render',
  };
}

export default function useBackgroundTheme(
  opts: UseBackgroundThemeOptions = {},
): BackgroundState {
  const [state, setState] = useState<BackgroundState>(() => resolveInitialBackground());

  const { attachToRoot } = opts;

  useEffect(() => {
    let cancelled = false;

    resolveTheme()
      .then((resolved: ResolvedTheme) => {
        if (cancelled) return;

        setState({
          url: resolved.url,
          key: resolved.key,
          reason: resolved.reason,
        });
        console.info(
          '[useBackgroundTheme] background applied:',
          resolved.key,
          resolved.url,
          `(${resolved.reason})`,
          `[${resolved.assetSource}:${resolved.assetFile}]`,
        );

        if (attachToRoot) {
          document.documentElement.style.setProperty(
            '--intro-bg-image',
            `url("${resolved.url}")`,
          );
        }

        // Preload the background image in parallel so it's in cache when used,
        // but do not gate state updates on this completing.
        preloadImage(resolved.url).then(() => {
          if (cancelled) return;
          // Optional: could add debug logging here if desired.
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        const fallbackKey = getBinaryFallbackKey(new Date());
        const fallbackAsset = resolveSkinAsset(fallbackKey);
        const fallbackReason = `resolveTheme:error:${error instanceof Error ? error.message : String(error)}`;

        console.warn('[useBackgroundTheme] resolver failed; using emergency fallback', {
          error,
          fallbackKey,
          fallbackAsset,
        });

        setState({
          url: fallbackAsset.url,
          key: fallbackAsset.key,
          reason: fallbackReason,
        });

        if (attachToRoot) {
          document.documentElement.style.setProperty(
            '--intro-bg-image',
            `url("${fallbackAsset.url}")`,
          );
        }

        preloadImage(fallbackAsset.url).catch(() => {
          // If even the emergency fallback fails, the background layer still has a URL.
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
