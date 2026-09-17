import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppSelector } from '../../store/hooks'
import './AllPowerFauxTvEffect.css'

// This beat carries a title plus a full explanatory sentence. Keep it on screen
// long enough to read at normal mobile pace instead of treating it like a stinger.
const EFFECT_MS = 5200

function seenStorageKey(gameId: string | null | undefined, week: number, winnerId: string): string {
  return `big-eye:all-power:${gameId ?? 'game'}:${week}:${winnerId}`
}

function hasSeenEffect(key: string | null): boolean {
  if (!key || typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/**
 * A presentation-only beat for the rare case where one player owns both LOH
 * and Power of Safety. It never writes gameplay state or adds another broadcast
 * event, so normal Faux TV sequencing remains unchanged.
 */
export default function AllPowerFauxTvEffect() {
  const gameId = useAppSelector((state) => state.game.gameId)
  const week = useAppSelector((state) => state.game.week)
  const phase = useAppSelector((state) => state.game.phase)
  const lohId = useAppSelector((state) => state.game.lohId)
  const posWinnerId = useAppSelector((state) => state.game.posWinnerId)
  const winnerName = useAppSelector((state) =>
    posWinnerId ? state.game.players.find((player) => player.id === posWinnerId)?.name : undefined
  )
  const [completedKey, setCompletedKey] = useState<string | null>(null)

  const triggerKey = useMemo(() => {
    if (phase !== 'pos_results' || !posWinnerId || posWinnerId !== lohId || !winnerName) return null
    return seenStorageKey(gameId, week, posWinnerId)
  }, [gameId, lohId, phase, posWinnerId, week, winnerName])

  const shouldRender = Boolean(
    triggerKey && completedKey !== triggerKey && !hasSeenEffect(triggerKey)
  )
  const viewport =
    shouldRender && typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('.tv-zone .tv-zone__viewport')
      : null

  useEffect(() => {
    if (!triggerKey || completedKey === triggerKey || hasSeenEffect(triggerKey)) return undefined
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined

    const zone = document.querySelector<HTMLElement>('.tv-zone')
    const target = zone?.querySelector<HTMLElement>('.tv-zone__viewport') ?? null
    if (!zone || !target) return undefined

    zone.classList.add('tv-zone--all-power')

    const timer = window.setTimeout(() => {
      try {
        // Mark the beat only after it has actually completed. This keeps React
        // StrictMode's development mount/cleanup cycle from consuming it unseen.
        sessionStorage.setItem(triggerKey, '1')
      } catch {
        // Presentation is still safe if storage is unavailable.
      }
      zone.classList.remove('tv-zone--all-power')
      setCompletedKey(triggerKey)
    }, EFFECT_MS)

    return () => {
      window.clearTimeout(timer)
      zone.classList.remove('tv-zone--all-power')
    }
  }, [completedKey, triggerKey])

  if (!shouldRender || !viewport || !winnerName) return null

  const winnerCopy =
    winnerName.trim().toLowerCase() === 'you'
      ? 'You now control both LOH and Safety.'
      : `${winnerName} now controls both LOH and Safety.`

  return createPortal(
    <div className="all-power-faux-tv" role="status" aria-live="assertive">
      <span className="all-power-faux-tv__sweep" aria-hidden="true" />
      <div className="all-power-faux-tv__content">
        <span className="all-power-faux-tv__eyebrow">
          <span className="all-power-faux-tv__dot" aria-hidden="true" />
          POWER SHIFT
        </span>
        <strong className="all-power-faux-tv__title">ALL THE POWER</strong>
        <span className="all-power-faux-tv__subtitle">{winnerCopy}</span>
      </div>
    </div>,
    viewport
  )
}
