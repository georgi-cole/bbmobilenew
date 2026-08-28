import { useEffect, useState } from 'react';
import type { Player } from '../types';
import {
  getProfilePhotoAvatarId,
  resolveAvatar,
  resolveAvatarCandidates,
} from '../utils/avatar';
import { imageIdToDataUrl } from '../utils/imageDb';

type PhotoState = {
  id: string;
  src: string | null;
};

export function useResolvedAvatarSrc(player: Pick<Player, 'id' | 'name' | 'avatar'> & Partial<Pick<Player, 'isUser'>>) {
  const profilePhotoId = getProfilePhotoAvatarId(player.avatar);
  const fallbackCandidates = resolveAvatarCandidates(player);
  const [photoState, setPhotoState] = useState<PhotoState | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!profilePhotoId) return undefined;

    void imageIdToDataUrl(profilePhotoId).then((url) => {
      if (cancelled) return;
      setPhotoState({ id: profilePhotoId, src: url });
    });

    return () => {
      cancelled = true;
    };
  }, [profilePhotoId]);

  const photoSrc = photoState?.id === profilePhotoId ? photoState.src : null;
  const loadingPhoto = Boolean(profilePhotoId && photoState?.id !== profilePhotoId);

  return {
    src: photoSrc ?? resolveAvatar(player),
    candidates: photoSrc ? [photoSrc] : fallbackCandidates,
    isLoadingProfilePhoto: loadingPhoto,
  };
}
