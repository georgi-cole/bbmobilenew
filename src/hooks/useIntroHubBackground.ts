import { useEffect, useState } from 'react';

interface IntroHubBackgroundState {
  url: string | null;
  ready: boolean;
}

interface ValidationState {
  resolvedFor: string | null;
  url: string | null;
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
  const isBypassed = preferredUrl == null || preferredUrl === fallbackUrl;
  const [validation, setValidation] = useState<ValidationState>({ resolvedFor: null, url: null });

  useEffect(() => {
    if (isBypassed || !preferredUrl) {
      return;
    }

    let cancelled = false;

    void loadImage(preferredUrl).then((ok) => {
      if (cancelled) return;

      if (ok) {
        setValidation({ resolvedFor: preferredUrl, url: preferredUrl });
        return;
      }

      if (import.meta.env.DEV) {
        console.warn('[HomeHub] Preferred intro background failed to load; using fallback', preferredUrl);
      }

      setValidation({ resolvedFor: preferredUrl, url: fallbackUrl ?? preferredUrl });
    });

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, isBypassed, preferredUrl]);

  if (isBypassed) {
    return {
      url: fallbackUrl ?? preferredUrl,
      ready: true,
    };
  }

  return {
    url: validation.resolvedFor === preferredUrl ? validation.url : (fallbackUrl ?? preferredUrl),
    ready: validation.resolvedFor === preferredUrl,
  };
}
