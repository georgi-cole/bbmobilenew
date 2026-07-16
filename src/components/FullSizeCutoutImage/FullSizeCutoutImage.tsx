import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import type { Player } from '../../types';
import { resolveFormalCutout, resolveInformalCutoutCandidates } from '../../utils/avatar';

interface FullSizeCutoutImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  player: Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar'>>;
  attire?: 'informal' | 'formal';
}

export default function FullSizeCutoutImage({
  player,
  attire = 'informal',
  onError,
  onLoad,
  style,
  ...imgProps
}: FullSizeCutoutImageProps) {
  const informalCandidates = resolveInformalCutoutCandidates(player);
  const formalCutout = attire === 'formal' ? resolveFormalCutout(player) : null;
  const candidates = [formalCutout, ...informalCandidates].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [resolved, setResolved] = useState(false);

  const src = candidates[Math.min(candidateIdx, candidates.length - 1)] ?? '';

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    setResolved(true);
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (candidateIdx < candidates.length - 1) {
      setResolved(false);
      setCandidateIdx((index) => Math.min(index + 1, candidates.length - 1));
      return;
    }
    setResolved(true);
    onError?.(event);
  }

  return (
    <img
      {...imgProps}
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      data-image-state={resolved ? 'resolved' : 'pending'}
      style={{
        ...style,
        // Keep the source visible while the load event settles. Cached local
        // assets can finish before React receives onLoad; hiding pending images
        // made valid housemate cutouts disappear for an entire recap scene.
        opacity: typeof style?.opacity === 'number' ? style.opacity : 1,
      }}
    />
  );
}
