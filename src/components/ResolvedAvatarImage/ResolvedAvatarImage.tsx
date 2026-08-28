import { useEffect, useMemo, useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react'
import {
  getLocalAvatarFallback,
  getProfilePhotoAvatarId,
  resolveAvatarCandidates,
} from '../../utils/avatar'
import { imageIdToDataUrl } from '../../utils/imageDb'
import { resolvePresentationAvatar } from '../../utils/presentationAvatar'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  id: string
  name: string
  avatar?: string
  isUser?: boolean
}

type FailedSourceState = {
  resolutionKey: string
  sources: ReadonlySet<string>
}

type ProfilePhotoState = {
  id: string
  url: string | null
}

const EMPTY_SOURCES: ReadonlySet<string> = new Set()

export default function ResolvedAvatarImage({
  id,
  name,
  avatar,
  isUser = false,
  onError,
  ...imageProps
}: Props) {
  const profilePhotoId = getProfilePhotoAvatarId(avatar)
  const resolutionKey = `${id}\u0000${name}\u0000${avatar ?? ''}\u0000${isUser ? '1' : '0'}`
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
              }).map(resolvePresentationAvatar)
            ),
          ],
    [avatar, id, isUser, name, profilePhotoId]
  )
  const [failedSourceState, setFailedSourceState] = useState<FailedSourceState>(() => ({
    resolutionKey,
    sources: new Set(),
  }))
  const [profilePhotoState, setProfilePhotoState] = useState<ProfilePhotoState>({
    id: '',
    url: null,
  })

  useEffect(() => {
    if (!profilePhotoId) return undefined

    let cancelled = false
    void imageIdToDataUrl(profilePhotoId).then((url) => {
      if (!cancelled) {
        setProfilePhotoState({ id: profilePhotoId, url })
      }
    })

    return () => {
      cancelled = true
    }
  }, [profilePhotoId])

  const failedSources =
    failedSourceState.resolutionKey === resolutionKey ? failedSourceState.sources : EMPTY_SOURCES
  const profilePhotoUrl = profilePhotoState.id === profilePhotoId ? profilePhotoState.url : null
  const candidateSrc = candidates.find((candidate) => !failedSources.has(candidate)) ?? fallback
  const src = profilePhotoUrl ?? (profilePhotoId ? fallback : candidateSrc)

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    onError?.(event)
    if (event.defaultPrevented) return

    if (profilePhotoId && profilePhotoUrl) {
      setProfilePhotoState({ id: profilePhotoId, url: null })
      return
    }

    setFailedSourceState((current) => {
      const sources =
        current.resolutionKey === resolutionKey ? new Set(current.sources) : new Set<string>()
      sources.add(src)
      return { resolutionKey, sources }
    })
  }

  return <img {...imageProps} src={src} onError={handleError} />
}
