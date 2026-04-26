import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import type { Player } from '../../types';
import { resolveInformalCutoutCandidates } from '../../utils/avatar';

interface FullSizeCutoutImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  player: Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar'>>;
}

export default function FullSizeCutoutImage({
  player,
  onError,
  onLoad,
  style,
  ...imgProps
}: FullSizeCutoutImageProps) {
  const candidates = resolveInformalCutoutCandidates(player);
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
        opacity: resolved ? (typeof style?.opacity === 'number' ? style.opacity : 1) : 0,
      }}
    />
  );
}
