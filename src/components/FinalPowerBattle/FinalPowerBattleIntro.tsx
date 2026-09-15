import { useEffect, useRef } from 'react'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './FinalPowerBattle.css'

interface Props {
  finalists: Player[]
  mode: 'classic' | 'vox_populi'
  onComplete: () => void
}

export default function FinalPowerBattleIntro({ finalists, mode, onComplete }: Props) {
  const completedRef = useRef(false)

  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (completedRef.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      completedRef.current = true
      onComplete()
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => window.removeEventListener('ui:playPressed', handlePlay)
  }, [onComplete])

  return (
    <section
      className="fpb-intro"
      role="dialog"
      aria-modal="true"
      aria-label="Final week announcement"
    >
      <div className="fpb-intro__scan" aria-hidden="true" />
      <p className="fpb-intro__network">THE BIG EYE · FINALE NIGHT</p>
      <div className="fpb-intro__finalists" aria-label="Finalists">
        {finalists.map((player, index) => (
          <div className={`fpb-intro__finalist fpb-intro__finalist--${index + 1}`} key={player.id}>
            <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
            <span>{player.name}</span>
          </div>
        ))}
      </div>

      <div className="fpb-intro__copy">
        <p className="fpb-intro__eyebrow">THE FINAL WEEK</p>
        <h2>The Final Power Battle</h2>
        <p className="fpb-intro__lead">
          Three finalists remain. Three parts decide who controls the final two places.
        </p>
        <ol className="fpb-intro__steps" aria-label="Final Power Battle format">
          <li>
            <strong>
              <span>01</span> Part 1
            </strong>
            <span>All three compete. The winner advances directly to Part 3.</span>
          </li>
          <li>
            <strong>
              <span>02</span> Part 2
            </strong>
            <span>The other two compete for the last place in the final battle.</span>
          </li>
          <li>
            <strong>
              <span>03</span> Part 3
            </strong>
            <span>
              The two winners face off.{' '}
              {mode === 'vox_populi'
                ? 'The winner is safe; the audience decides the remaining Final Two place.'
                : 'The winner chooses who joins them in the Final Two; the third-place finalist joins the Tribunal.'}
            </span>
          </li>
        </ol>
      </div>
      <p className="fpb-intro__play-cue">
        Press the Play button when you are ready to begin Part 1.
      </p>
    </section>
  )
}
