import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppSelector } from '../../store/hooks'
import './AllPowerFauxTvEffect.css'

const EFFECT_MS = 2300

function seenStorageKey(gameId: string | null | undefined, week: number, winnerId: string): string {
  return `big-eye:all-power:${gameId ?? 'game'}:${week}:${winnerId}`
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
  const [active, setActive] = useState(false)
  const [viewport, setViewport] = useState<HTMLElement | null>(null)

  const triggerKey = useMemo(() => {
    if (phase !== 'pos_results' || !posWinnerId || posWinnerId !== lohId || !winnerName) return null
    return seenStorageKey(gameId, week, posWinnerId)
  }, [gameId, lohId, phase, posWinnerId, week, winnerName])

  useEffect(() => {
    if (!triggerKey || typeof document === 'undefined') return undefined
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(triggerKey) === '1') {
      return undefined
    }

    const zone = document.querySelector<HTMLElement>('.tv-zone')
    const target = zone?.querySelector<HTMLElement>('.tv-zone__viewport') ?? null
    if (!zone || !target) return undefined

    zone.classList.add('tv-zone--all-power')
    setViewport(target)
    setActive(true)

    const timer = window.setTimeout(() => {
      try {
        // Mark the beat only after it has actually completed. This keeps React
        // StrictMode's development mount/cleanup cycle from consuming it unseen.
        sessionStorage.setItem(triggerKey, '1')
      } catch {
        // Presentation is still safe if storage is unavailable.
      }
      zone.classList.remove('tv-zone--all-power')
      setActive(false)
      setViewport(null)
    }, EFFECT_MS)

    return () => {
      window.clearTimeout(timer)
      zone.classList.remove('tv-zone--all-power')
      setActive(false)
      setViewport(null)
    }
  }, [triggerKey])

  if (!active || !viewport || !winnerName) return null

  return createPortal(
    <div className="all-power-faux-tv" role="status" aria-live="assertive">
      <span className="all-power-faux-tv__sweep" aria-hidden="true" />
      <div className="all-power-faux-tv__content">
        <span className="all-power-faux-tv__eyebrow">
          <span className="all-power-faux-tv__dot" aria-hidden="true" />
          POWER SHIFT
        </span>
        <strong className="all-power-faux-tv__title">ALL THE POWER</strong>
        <span className="all-power-faux-tv__subtitle">
          {winnerName} now controls both LOH and Safety.
        </span>
      </div>
    </div>,
    viewport
  )
}
