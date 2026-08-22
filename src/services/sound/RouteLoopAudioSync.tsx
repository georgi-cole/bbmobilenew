import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const INTRO_HUB_LOOP_KEY = 'music:intro_hub_loop'
const PLAYER_EVICTION_LOOP_KEY = 'player:self_evict_loop'

function isIntroHubHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '#/'
}

function isSelfEvictedHash(hash: string): boolean {
  return /^#\/self-evicted(?:[/?#]|$)/.test(hash)
}

function isHumanEviction(humanId: string | null, overlayId: string | null): boolean {
  return humanId != null && overlayId === humanId
}

/**
 * Owns the two long-form loops that are tied to route/overlay visibility rather
 * than a normal gameplay phase.
 *
 * Intro Hub uses the music category so it obeys the user's music setting and
 * master music volume. The eviction loop uses the player category so it can
 * sit above the already-ducked eviction ceremony bed without taking ownership
 * of the centralized BGM channel.
 */
export default function RouteLoopAudioSync({ hash }: { hash: string }) {
  const musicOn = useSelector((state: RootState) => state.settings.audio.musicOn)
  const sfxOn = useSelector((state: RootState) => state.settings.audio.sfxOn)
  const evictionOverlayPlayerId = useSelector(
    (state: RootState) => state.game.evictionOverlayPlayerId ?? null
  )
  const humanPlayerId = useSelector(
    (state: RootState) => state.game.players.find((player) => player.isUser)?.id ?? null
  )

  const introHubActive = isIntroHubHash(hash)
  const playerEvictionActive =
    isSelfEvictedHash(hash) || isHumanEviction(humanPlayerId, evictionOverlayPlayerId)

  useEffect(() => {
    SoundManager.registerDynamic({
      key: INTRO_HUB_LOOP_KEY,
      category: 'music',
      src: `${BASE}/assets/sounds/cinematic/Intro_hub_loop.mp3`,
      preload: false,
      volume: 0.55,
      loop: true,
    })
    SoundManager.registerDynamic({
      key: PLAYER_EVICTION_LOOP_KEY,
      category: 'player',
      src: `${BASE}/assets/sounds/events/player_self_evict.mp3`,
      preload: false,
      volume: 1,
      loop: true,
    })

    return () => {
      SoundManager.stop(INTRO_HUB_LOOP_KEY)
      SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
    }
  }, [])

  useEffect(() => {
    if (!introHubActive || !musicOn || playerEvictionActive) {
      SoundManager.stop(INTRO_HUB_LOOP_KEY)
      return
    }

    // The hub is outside gameplay. Clear any stale gameplay BGM before
    // starting its dedicated loop so returning home never layers two beds.
    SoundManager.stopAllMusic()

    // Browser/WebView autoplay rules may reject audio until the first user
    // gesture. Arm the manager's normal unlock listeners and also retry this
    // route-owned loop from that same gesture after the manager has unlocked.
    SoundManager.unlockOnUserGesture()
    void SoundManager.play(INTRO_HUB_LOOP_KEY)

    const startAfterGesture = () => {
      SoundManager.stop(INTRO_HUB_LOOP_KEY)
      void SoundManager.play(INTRO_HUB_LOOP_KEY)
    }
    document.addEventListener('pointerdown', startAfterGesture, { once: true })
    document.addEventListener('keydown', startAfterGesture, { once: true })

    return () => {
      document.removeEventListener('pointerdown', startAfterGesture)
      document.removeEventListener('keydown', startAfterGesture)
      SoundManager.stop(INTRO_HUB_LOOP_KEY)
    }
  }, [introHubActive, musicOn, playerEvictionActive])

  useEffect(() => {
    if (playerEvictionActive && sfxOn) {
      void SoundManager.play(PLAYER_EVICTION_LOOP_KEY)
    } else {
      SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
    }

    return () => SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
  }, [playerEvictionActive, sfxOn])

  return null
}
