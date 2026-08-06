import { useEffect, useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import {
  getLocalAvatarFallback,
  getProfilePhotoAvatarId,
  resolveAvatarCandidates,
} from '../../utils/avatar'
import { imageIdToDataUrl } from '../../utils/imageDb'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  id: string
  name: string
  avatar?: string
  isUser?: boolean
}

export default function ResolvedAvatarImage({
  id,
  name,
  avatar,
  isUser = false,
  onError,
  ...imageProps
}: Props) {
  const profilePhotoId = getProfilePhotoAvatarId(avatar)
  const fallback = useMemo(() => getLocalAvatarFallback(name, isUser), [isUser, name])
  const candidates = useMemo(
    () =>
      profilePhotoId
        ? []
        : [
            ...new Set(
              resolveAvatarCandidates({
                id,
                name,
                avatar: avatar ?? '',
                isUser,
              })
            ),
          ],
    [avatar, id, isUser, name, profilePhotoId]
  )
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    setCandidateIndex(0)
  }, [avatar, id, isUser, name])

  useEffect(() => {
    let cancelled = false
    setProfilePhotoUrl(null)
    if (!profilePhotoId) return undefined

    void imageIdToDataUrl(profilePhotoId).then((url) => {
      if (!cancelled) setProfilePhotoUrl(url)
    })

    return () => {
      cancelled = true
    }
  }, [profilePhotoId])

  const src =
    profilePhotoUrl ?? (profilePhotoId ? fallback : (candidates[candidateIndex] ?? fallback))

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event)
    if (event.defaultPrevented) return

    if (profilePhotoId && profilePhotoUrl) {
      setProfilePhotoUrl(null)
      return
    }

    setCandidateIndex((current) => Math.min(current + 1, Math.max(0, candidates.length - 1)))
  }

  return <img {...imageProps} src={src} onError={handleError} />
}
