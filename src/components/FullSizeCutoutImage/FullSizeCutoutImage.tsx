import { useEffect, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';
import type { Player } from '../../types';
import {
  getProfilePhotoAvatarId,
  resolveFormalCutout,
  resolveInformalCutoutCandidates,
} from '../../utils/avatar';
import { imageIdToDataUrl } from '../../utils/imageDb';

interface FullSizeCutoutImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  player: Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar'>>;
  attire?: 'informal' | 'formal';
}

function FullSizeCutoutImageInstance({
  player,
  attire = 'informal',
  onError,
  onLoad,
  style,
  ...imgProps
}: FullSizeCutoutImageProps) {
  const profilePhotoId = getProfilePhotoAvatarId(player.avatar);
  const [profilePhotoSrc, setProfilePhotoSrc] = useState<string | null>(null);
  const [profilePhotoFailed, setProfilePhotoFailed] = useState(false);
  const informalCandidates = resolveInformalCutoutCandidates(player);
  const formalCutout = attire === 'formal' ? resolveFormalCutout(player) : null;
  const candidates = [formalCutout, ...informalCandidates].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!profilePhotoId) return () => { cancelled = true; };

    void imageIdToDataUrl(profilePhotoId).then((url) => {
      if (cancelled) return;
      setProfilePhotoSrc(url);
      if (!url) setProfilePhotoFailed(true);
    });

    return () => { cancelled = true; };
  }, [profilePhotoId]);

  const src = profilePhotoSrc && !profilePhotoFailed
    ? profilePhotoSrc
    : candidates[Math.min(candidateIdx, candidates.length - 1)] ?? '';

  function handleLoad(event: SyntheticEvent<HTMLImageElement, Event>) {
    setResolved(true);
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement, Event>) {
    if (profilePhotoSrc && !profilePhotoFailed) {
      setProfilePhotoFailed(true);
      setResolved(false);
      return;
    }
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
      data-avatar-source={profilePhotoSrc && !profilePhotoFailed ? 'uploaded' : 'cutout'}
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

export default function FullSizeCutoutImage(props: FullSizeCutoutImageProps) {
  const identity = `${props.player.id}:${props.player.avatar ?? ''}:${props.attire ?? 'informal'}`;
  return <FullSizeCutoutImageInstance key={identity} {...props} />;
}
