import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import type { Player } from '../../types';
import { resolveInformalCutoutCandidates } from '../../utils/avatar';

interface FullSizeCutoutImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  player: Pick<Player, 'id' | 'name' | 'avatar'>;
}

export default function FullSizeCutoutImage({
  player,
  onError,
  ...imgProps
}: FullSizeCutoutImageProps) {
  const candidates = resolveInformalCutoutCandidates(player);
  const [candidateIdx, setCandidateIdx] = useState(0);

  const src = candidates[Math.min(candidateIdx, candidates.length - 1)] ?? '';

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((index) => Math.min(index + 1, candidates.length - 1));
      return;
    }
    onError?.(event);
  }

  return <img {...imgProps} src={src} onError={handleError} />;
}
