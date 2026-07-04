import { useEffect, useMemo, useState } from 'react';
import type { Player } from '../types';
import {
  getProfilePhotoAvatarId,
  resolveAvatar,
  resolveAvatarCandidates,
} from '../utils/avatar';
import { imageIdToDataUrl } from '../utils/imageDb';

export function useResolvedAvatarSrc(player: Pick<Player, 'id' | 'name' | 'avatar'> & Partial<Pick<Player, 'isUser'>>) {
  const profilePhotoId = getProfilePhotoAvatarId(player.avatar);
  const fallbackCandidates = useMemo(
    () => resolveAvatarCandidates(player),
    [player.avatar, player.id, player.isUser, player.name],
  );
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(Boolean(profilePhotoId));

  useEffect(() => {
    let cancelled = false;
    setPhotoSrc(null);
    setLoadingPhoto(Boolean(profilePhotoId));

    if (!profilePhotoId) return undefined;

    void imageIdToDataUrl(profilePhotoId).then((url) => {
      if (cancelled) return;
      setPhotoSrc(url);
      setLoadingPhoto(false);
    });

    return () => {
      cancelled = true;
    };
  }, [profilePhotoId]);

  return {
    src: photoSrc ?? resolveAvatar(player),
    candidates: photoSrc ? [photoSrc] : fallbackCandidates,
    isLoadingProfilePhoto: loadingPhoto,
  };
}
