import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { getAll } from '../../data/houseguests'
import { resolveAvatar } from '../../utils/avatar'
import { preloadImage, preloadImages } from '../../utils/preload'
import KolequantSplash from '../KolequantSplash/KolequantSplash'
import GAMEPLAY_BG from '../../assets/bb-gameplay-bg.svg'
import { beginGameplayAudioExit } from '../../services/sound/audioRouteOwnership'

const GAMEPLAY_MESSAGES = [
  'Opening the competition arena.',
  'Lighting the game board.',
  'Positioning the houseguests.',
  'Priming the challenge controls.',
  'Rolling cameras for the next scene.',
] as const

function getAvatarUrls(): string[] {
  return getAll().map((hg) => resolveAvatar({ id: hg.id, name: hg.name, avatar: '' }))
}

interface AssetPreloaderOverlayProps {
  destination?: string
}

export default function AssetPreloaderOverlay({
  destination = '/game',
}: AssetPreloaderOverlayProps) {
  const navigate = useNavigate()
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Opening the competition arena.')
  const doneFiredRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    // The preloader deliberately stays on the Intro Hub route. Transfer audio
    // ownership now so the route resolver cannot restart the hub loop while
    // gameplay assets are loading.
    beginGameplayAudioExit()

    async function run() {
      setStatus('Loading the competition background.')
      await preloadImage(GAMEPLAY_BG)
      if (cancelled) return

      const avatarUrls = getAvatarUrls()
      const total = 1 + avatarUrls.length
      let loaded = 1
      setProgress(total > 0 ? Math.round((loaded / total) * 95) : 95)
      setStatus('Preparing the houseguest portraits.')

      const results = await preloadImages(avatarUrls, (avatarLoaded) => {
        loaded = 1 + avatarLoaded
        // Keep the final few percent reserved for decode/retry verification so
        // a timed-out request is never visually presented as fully prepared.
        setProgress(Math.min(95, Math.round((loaded / total) * 95)))
      })

      if (cancelled) return

      const retryUrls = results
        .filter((result) => result.status !== 'loaded')
        .map((result) => result.url)

      if (retryUrls.length > 0) {
        setStatus('Finishing slower portraits.')
        const retryResults = await preloadImages(retryUrls, undefined, 12_000)
        const unresolved = retryResults.filter((result) => result.status !== 'loaded')
        if (unresolved.length > 0) {
          console.warn('[asset-preloader] continuing with unresolved portraits', unresolved)
        }
      }

      if (cancelled || doneFiredRef.current) return
      doneFiredRef.current = true
      setProgress(100)
      setStatus('Entering the house.')
      navigate(destination)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [destination, navigate])

  return (
    <KolequantSplash
      duration={600000}
      ready={false}
      progress={progress}
      status={status}
      messages={GAMEPLAY_MESSAGES}
    />
  )
}
