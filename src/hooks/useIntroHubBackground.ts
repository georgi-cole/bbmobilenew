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
  const [url, setUrl] = useState<string | null>(fallbackUrl ?? preferredUrl);

  useEffect(() => {
    let cancelled = false;
    const immediateUrl = fallbackUrl ?? preferredUrl;
    setUrl(immediateUrl);

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
            fallbackUrl: immediateUrl,
          });
        }
        setUrl(preferredUrl);
        return;
      }

      if (import.meta.env.DEV) {
        console.warn('[HomeHub] Preferred intro background failed to load; using fallback', {
          preferredUrl,
          fallbackUrl: immediateUrl,
        });
      }
      setUrl(immediateUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, preferredUrl]);

  return {
    url: url ?? fallbackUrl ?? preferredUrl,
    ready: true,
  };
}
