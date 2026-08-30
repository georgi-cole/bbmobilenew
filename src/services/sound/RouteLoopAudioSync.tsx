import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const PLAYER_EVICTION_LOOP_KEY = 'player:self_evict_loop'

function isSelfEvictedHash(hash: string): boolean {
  return /^#\/self-evicted(?:[/?#]|$)/.test(hash)
}

function isHumanEviction(humanId: string | null, overlayId: string | null): boolean {
  return humanId != null && overlayId === humanId
}

/**
 * Owns route-only player SFX. Intro Hub music is deliberately absent: it is a
 * normal `introhub` track resolved by AudioStateSync, so the SoundManager owns
 * every background-music transition.
 */
export default function RouteLoopAudioSync({ hash }: { hash: string }) {
  const sfxOn = useSelector((state: RootState) => state.settings.audio.sfxOn)
  const evictionOverlayPlayerId = useSelector(
    (state: RootState) => state.game.evictionOverlayPlayerId ?? null
  )
  const humanPlayerId = useSelector(
    (state: RootState) => state.game.players.find((player) => player.isUser)?.id ?? null
  )
  const playerEvictionActive =
    isSelfEvictedHash(hash) || isHumanEviction(humanPlayerId, evictionOverlayPlayerId)

  useEffect(() => {
    SoundManager.registerDynamic({
      key: PLAYER_EVICTION_LOOP_KEY,
      category: 'player',
      src: `${BASE}/assets/sounds/events/player_self_evict.mp3`,
      preload: false,
      volume: 1,
      loop: true,
    })
    return () => SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
  }, [])

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
