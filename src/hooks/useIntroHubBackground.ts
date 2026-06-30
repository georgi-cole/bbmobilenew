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
 * The hook returns a usable URL immediately so the screen can paint on the
 * first frame, then upgrades to the preferred remote image in the background
 * if it loads.
 */
export default function useIntroHubBackground(
  preferredUrl: string | null,
  fallbackUrl: string | null,
): IntroHubBackgroundState {
  const [preferredLoadedUrl, setPreferredLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!preferredUrl || preferredUrl === fallbackUrl) {
      return () => {
        cancelled = true;
      };
    }

    void loadImage(preferredUrl).then((ok) => {
      if (cancelled) return;

      if (ok) {
        if (import.meta.env.DEV) {
          console.info('[HomeHub] Preferred intro background loaded', {
            preferredUrl,
            fallbackUrl,
          });
        }
        setPreferredLoadedUrl(preferredUrl);
        return;
      }

      if (import.meta.env.DEV) {
        console.warn('[HomeHub] Preferred intro background failed to load; using fallback', {
          preferredUrl,
          fallbackUrl,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, preferredUrl]);

  const url = preferredLoadedUrl === preferredUrl ? preferredUrl : fallbackUrl ?? preferredUrl;

  return {
    url,
    ready: true,
  };
}
