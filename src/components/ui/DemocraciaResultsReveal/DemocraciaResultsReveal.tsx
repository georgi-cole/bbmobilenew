import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Player } from '../../../types'
import PlayerAvatar from '../../PlayerAvatar/PlayerAvatar'
import './DemocraciaResultsReveal.css'

type DemocraciaResultsRevealParticipant = {
  player: Player
  voteCount: number
}

type DemocraciaResultsRevealProps = {
  mode: 'winner' | 'tie' | 'message'
  title: string
  subtitle: string
  participants: DemocraciaResultsRevealParticipant[]
  onDone: () => void
  countdownMs?: number
}

const DEFAULT_COUNTDOWN_MS = 2600

export default function DemocraciaResultsReveal({
  mode,
  subtitle,
  participants,
  onDone,
  countdownMs = DEFAULT_COUNTDOWN_MS,
}: DemocraciaResultsRevealProps) {
  const safeAreaRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentScale, setContentScale] = useState(1)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDone(), countdownMs)
    return () => window.clearTimeout(timeoutId)
  }, [countdownMs, onDone])

  useLayoutEffect(() => {
    const safeArea = safeAreaRef.current
    const content = contentRef.current

    if (!safeArea || !content) return

    let frameId = 0

    const recalculateScale = () => {
      const safeAreaStyles = window.getComputedStyle(safeArea)
      const horizontalPadding =
        (Number.parseFloat(safeAreaStyles.paddingLeft) || 0) +
        (Number.parseFloat(safeAreaStyles.paddingRight) || 0)
      const verticalPadding =
        (Number.parseFloat(safeAreaStyles.paddingTop) || 0) +
        (Number.parseFloat(safeAreaStyles.paddingBottom) || 0)
      const availableWidth = Math.max(0, safeArea.clientWidth - horizontalPadding)
      const availableHeight = Math.max(0, safeArea.clientHeight - verticalPadding)
      const contentWidth = content.scrollWidth
      const contentHeight = content.scrollHeight

      if (availableWidth <= 0 || availableHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
        setContentScale(1)
        return
      }

      const nextScale = Number(
        Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight).toFixed(4)
      )

      setContentScale((currentScale) =>
        Math.abs(currentScale - nextScale) < 0.01 ? currentScale : nextScale
      )
    }

    const scheduleRecalculation = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(recalculateScale)
    }

    scheduleRecalculation()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleRecalculation()
      })
      resizeObserver.observe(safeArea)
      resizeObserver.observe(content)
    }

    window.addEventListener('resize', scheduleRecalculation)

    return () => {
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleRecalculation)
    }
  }, [mode, participants, subtitle])

  const badgeLabel = mode === 'winner' ? 'Winner' : mode === 'tie' ? 'Tie' : 'Revote'

  const contentStyle: CSSProperties = {
    transform: `scale(${contentScale})`,
  }

  return (
    <section className="democracia-results" aria-label="Democracia results">
      <div className="democracia-results__safe-area" ref={safeAreaRef}>
        <div className="democracia-results__content" ref={contentRef} style={contentStyle}>
          <div className="democracia-results__badge">{badgeLabel}</div>
          <div className="democracia-results__body">
            <p className="democracia-results__subtitle">{subtitle}</p>
            {participants.length > 0 && (
              <div
                className={[
                  'democracia-results__participants',
                  participants.length === 1 ? 'democracia-results__participants--solo' : '',
                  participants.length === 2 ? 'democracia-results__participants--pair' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {participants.map(({ player, voteCount }) => (
                  <article className="democracia-results__participant" key={player.id}>
                    <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
                    <span className="democracia-results__participant-name">{player.name}</span>
                    <span className="democracia-results__participant-count">
                      {voteCount} vote{voteCount === 1 ? '' : 's'}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
