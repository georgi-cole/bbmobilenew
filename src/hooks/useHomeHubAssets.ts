import { useEffect, useMemo, useState } from 'react';
import useLoadIntroHub from './useLoadIntroHub';
import { preloadImage } from '../utils/preload';
import { getHomeHubAssetUrls } from '../screens/HomeHub/homeHubAssets';

interface HomeHubAssetsState {
  ready: boolean;
  progress: number;
  status: string;
}

function hasIntroHubChips(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.querySelector('#intro-hub .hub-chip') != null;
}

function hasFontFaceSet(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document && !!document.fonts;
}

export default function useHomeHubAssets(effectiveBgUrl: string | null): HomeHubAssetsState {
  useLoadIntroHub();

  const assetUrls = useMemo(() => getHomeHubAssetUrls(effectiveBgUrl), [effectiveBgUrl]);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [imagesReady, setImagesReady] = useState(assetUrls.length === 0);
  const [fontsReady, setFontsReady] = useState(() => !hasFontFaceSet());
  const [runtimeReady, setRuntimeReady] = useState(() => hasIntroHubChips());

  useEffect(() => {
    let cancelled = false;

    setImagesLoaded(0);
    setImagesReady(assetUrls.length === 0);

    if (assetUrls.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const loadImages = async () => {
      const [first, ...rest] = assetUrls;

      await preloadImage(first);
      if (cancelled) return;
      setImagesLoaded((count) => count + 1);

      if (rest.length > 0) {
        await Promise.all(
          rest.map((url) =>
            preloadImage(url).then(() => {
              if (cancelled) return;
              setImagesLoaded((count) => count + 1);
            }),
          ),
        );
      }

      if (!cancelled) {
        setImagesReady(true);
      }
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, [assetUrls]);

  useEffect(() => {
    if (!hasFontFaceSet()) {
      setFontsReady(true);
      return;
    }

    let cancelled = false;
    setFontsReady(false);

    document.fonts.ready
      .then(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFontsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (runtimeReady || typeof document === 'undefined') {
      return;
    }

    const container = document.getElementById('intro-hub');
    if (!container) {
      return;
    }

    const syncRuntime = () => {
      if (container.querySelector('.hub-chip')) {
        setRuntimeReady(true);
      }
    };

    syncRuntime();
    if (hasIntroHubChips()) {
      return;
    }

    const observer = new MutationObserver(syncRuntime);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [runtimeReady]);

  const totalSteps = assetUrls.length + 2;
  const completedSteps = imagesLoaded + (fontsReady ? 1 : 0) + (runtimeReady ? 1 : 0);
  const progress = totalSteps > 0 ? Math.min(100, Math.round((completedSteps / totalSteps) * 100)) : 100;
  const ready = imagesReady && fontsReady && runtimeReady;
  const status = ready
    ? 'Intro hub ready'
    : !runtimeReady && imagesReady && fontsReady
    ? 'Finalizing intro hub...'
    : 'Loading intro hub...';

  return { ready, progress, status };
}
