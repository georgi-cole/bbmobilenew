import { useEffect, useState } from 'react';

interface IntroHubBackgroundState {
  url: string | null;
  ready: boolean;
}

function loadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

/**
 * Resolves the IntroHub background URL.
 *
 * Preference order:
 *   1. Preferred remote background, if it loads successfully.
 *   2. Local themed fallback background.
 *
 * The hook keeps a known-good fallback visible while the preferred image is
 * being validated so Capacitor/iOS never ends up with a broken background.
 */
export default function useIntroHubBackground(
  preferredUrl: string | null,
  fallbackUrl: string | null,
): IntroHubBackgroundState {
  const [state, setState] = useState<IntroHubBackgroundState>(() => ({
    url: fallbackUrl ?? preferredUrl,
    ready: preferredUrl == null || preferredUrl === fallbackUrl,
  }));

  useEffect(() => {
    let cancelled = false;

    if (!preferredUrl) {
      setState({ url: fallbackUrl, ready: true });
      return () => {
        cancelled = true;
      };
    }

    if (preferredUrl === fallbackUrl) {
      setState({ url: preferredUrl, ready: true });
      return () => {
        cancelled = true;
      };
    }

    const cacheFallback = fallbackUrl ?? null;
    // Keep the fallback visible while we probe the preferred URL.
    setState({ url: cacheFallback ?? preferredUrl, ready: false });

    void loadImage(preferredUrl).then((ok) => {
      if (cancelled) return;

      if (ok) {
        setState({ url: preferredUrl, ready: true });
        return;
      }

      if (import.meta.env.DEV) {
        console.warn('[HomeHub] Preferred intro background failed to load; using fallback', preferredUrl);
      }

      setState({ url: cacheFallback ?? preferredUrl, ready: true });
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, preferredUrl]);

  return state;
}
