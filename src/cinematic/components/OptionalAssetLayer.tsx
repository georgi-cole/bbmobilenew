import { useEffect, useRef, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { OPTIONAL_ASSETS } from '../config/cinematicConfig';
import type { TimelineState } from '../timeline/timeline';

const useOptionalImage = (relativePath: string): string | null => {
  const source = staticFile(relativePath);
  const [available, setAvailable] = useState(false);
  const [handle] = useState(() => delayRender(`Checking optional cinematic asset: ${relativePath}`));
  const settledRef = useRef(false);

  useEffect(() => {
    const image = new Image();
    const settle = (exists: boolean) => {
      if (settledRef.current) return;
      settledRef.current = true;
      setAvailable(exists);
      if (!exists && import.meta.env.DEV) {
        console.info(`[cinematic] Optional asset not found, using procedural fallback: ${relativePath}`);
      }
      continueRender(handle);
    };
    image.onload = () => settle(image.naturalWidth > 0);
    image.onerror = () => settle(false);
    image.src = source;
    return () => {
      image.onload = null;
      image.onerror = null;
      if (!settledRef.current) settle(false);
    };
  }, [handle, relativePath, source]);

  return available ? source : null;
};

export const OptionalAssetLayer = ({ state }: { state: TimelineState }) => {
  const skyline = useOptionalImage(OPTIONAL_ASSETS.distantSkyline);
  const clouds1 = useOptionalImage(OPTIONAL_ASSETS.clouds1);
  const clouds2 = useOptionalImage(OPTIONAL_ASSETS.clouds2);
  const stars = useOptionalImage(OPTIONAL_ASSETS.stars);

  return (
    <div className="big-eye-assets" aria-hidden="true">
      {skyline && (
        <img
          className="big-eye-assets__skyline"
          src={skyline}
          style={{ opacity: 0.1 + state.cloudDarkness * 0.08 }}
        />
      )}
      {stars && (
        <img className="big-eye-assets__stars" src={stars} style={{ opacity: state.starsOpacity * 0.22 }} />
      )}
      {clouds1 && (
        <img
          className="big-eye-assets__cloud big-eye-assets__cloud--one"
          src={clouds1}
          style={{ opacity: state.cloudOpacity * 0.16, transform: `translateX(${state.frame * 0.035 - 20}px)` }}
        />
      )}
      {clouds2 && (
        <img
          className="big-eye-assets__cloud big-eye-assets__cloud--two"
          src={clouds2}
          style={{ opacity: state.cloudOpacity * 0.12, transform: `translateX(${-state.frame * 0.025 + 15}px)` }}
        />
      )}
    </div>
  );
};
