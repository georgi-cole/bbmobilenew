import { useEffect, useRef } from 'react'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import './FinalPowerBattle.css'

interface Props {
  blockPlayer: Player
  competitors: Player[]
  mode: 'classic' | 'vox_populi'
  onComplete: () => void
}

export default function FinalThreeBlockReveal({
  blockPlayer,
  competitors,
  mode,
  onComplete,
}: Props) {
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

  const finalLine =
    mode === 'vox_populi'
      ? 'The winner earns final immunity. The audience will decide the final place in the Final Two.'
      : 'The winner earns the power to choose who joins them in the Final Two.'
  const setupNarration =
    mode === 'vox_populi'
      ? finalLine
      : `${competitors[0]?.name ?? 'The Part 1 winner'} advanced directly. ${competitors[1]?.name ?? 'The Part 2 winner'} won the qualifier. ${blockPlayer.name} is already on the block.`

  return (
    <section
      className="fpb-block"
      role="dialog"
      aria-modal="true"
      aria-label="Final Power Battle setup"
    >
      <div className="fpb-block__light" aria-hidden="true" />
      <p className="fpb-block__network">THE BIG EYE · FINAL POWER BATTLE</p>
      <div className="fpb-block__nominee">
        <p>ALREADY ON THE BLOCK</p>
        <PlayerAvatar player={blockPlayer} size="lg" showEvictedStyle={false} />
        <strong>{blockPlayer.name}</strong>
      </div>
      <div className="fpb-block__versus" aria-label="Final Power Battle competitors">
        {competitors.map((player, index) => (
          <div className="fpb-block__competitor" key={player.id}>
            <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
            <span>{player.name}</span>
            {index === 0 && <em>VS</em>}
          </div>
        ))}
      </div>
      <div className="fpb-block__copy">
        <p className="fpb-block__eyebrow">PART 3 · THE FINAL POWER BATTLE</p>
        <h2>Two finalists. One final power.</h2>
        <p>{setupNarration}</p>
      </div>
      <p className="fpb-intro__play-cue">
        Press Play when you are ready to enter the final battle.
      </p>
    </section>
  )
}
