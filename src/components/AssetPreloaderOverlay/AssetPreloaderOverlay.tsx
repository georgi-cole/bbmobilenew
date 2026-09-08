import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { getAll } from '../../data/houseguests'
import { resolveAvatar } from '../../utils/avatar'
import { getPresentationAvatarPreloadUrls } from '../../utils/avatarPreloadCandidates'
import { preloadImage, preloadImages } from '../../utils/preload'
import { buildDepressionShockAvatarCandidates } from '../../features/twists/depressionShock'
import RouteLoadingScreen from '../RouteLoadingScreen/RouteLoadingScreen'
import GAMEPLAY_BG from '../../assets/bb-gameplay-bg.svg'
import {
  beginGameplayAudioExit,
  cancelGameplayAudioExit,
} from '../../services/sound/audioRouteOwnership'

function getAvatarUrls(): string[] {
  return getPresentationAvatarPreloadUrls(getAll())
}

function getThemedAvatarUrls(): string[] {
  return getAll().flatMap((hg) => {
    const normalAvatar = resolveAvatar({ id: hg.id, name: hg.name, avatar: '' })
    // The Depression Shock grey/sad portraits are separate, much heavier assets.
    // Warm the canonical portrait before gameplay so the later theme switch does
    // not perform a cold fetch while the roster is already visible.
    return buildDepressionShockAvatarCandidates(hg.id, [normalAvatar], hg.name).slice(0, 1)
  })
}

interface AssetPreloaderOverlayProps {
  destination?: string
}

export default function AssetPreloaderOverlay({
  destination = '/game',
}: AssetPreloaderOverlayProps) {
  const navigate = useNavigate()
  const doneFiredRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    // The preloader deliberately stays on the Intro Hub route. Transfer audio
    // ownership now so the route resolver cannot restart the hub loop while
    // gameplay assets are loading.
    beginGameplayAudioExit()

    async function run() {
      await preloadImage(GAMEPLAY_BG)
      if (cancelled) return

      const avatarUrls = [...new Set([...getAvatarUrls(), ...getThemedAvatarUrls()])]
      const results = await preloadImages(avatarUrls)

      if (cancelled) return

      const retryUrls = results
        .filter((result) => result.status !== 'loaded')
        .map((result) => result.url)

      if (retryUrls.length > 0) {
        const retryResults = await preloadImages(retryUrls, undefined, 12_000)
        const unresolved = retryResults.filter((result) => result.status !== 'loaded')
        if (unresolved.length > 0) {
          console.warn('[asset-preloader] continuing with unresolved portraits', unresolved)
        }
      }

      if (cancelled || doneFiredRef.current) return
      doneFiredRef.current = true
      navigate(destination)
    }

    void run()
    return () => {
      cancelled = true
      if (!doneFiredRef.current) cancelGameplayAudioExit()
    }
  }, [destination, navigate])

  // The Kolequant city splash is reserved for the initial arrival. Starting a
  // game uses this same handoff screen as the lazy game route, so the player
  // never sees two loading experiences back to back.
  return <RouteLoadingScreen />
}
