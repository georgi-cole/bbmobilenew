import { useEffect } from 'react'
import type { Player } from '../../types'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import { trackProductEvent } from '../../services/liveOps/productTelemetry'
import './VoxFinalThreeAppeal.css'

export type VoxFinalAppeal = 'underdog' | 'loyalty' | 'resume'

interface Props {
  player: Player
  onSelect: (appeal: VoxFinalAppeal) => void
}

const APPEALS: Array<{ id: VoxFinalAppeal; title: string; copy: string; icon: string }> = [
  {
    id: 'underdog',
    title: 'The fight',
    copy: 'Remind them what it took to survive this far.',
    icon: '⚡',
  },
  {
    id: 'loyalty',
    title: 'The people',
    copy: 'Make your case through the bonds that carried your season.',
    icon: '🤝',
  },
  {
    id: 'resume',
    title: 'The game',
    copy: 'Own the moves and wins that made your season.',
    icon: '🏆',
  },
]

export default function VoxFinalThreeAppeal({ player, onSelect }: Props) {
  useEffect(() => {
    trackProductEvent('final3_appeal_shown', { game_mode: 'vox_populi' })
  }, [])

  const handleSelect = (appeal: VoxFinalAppeal) => {
    trackProductEvent('final3_appeal_selected', { game_mode: 'vox_populi', appeal })
    onSelect(appeal)
  }

  return (
    <section
      className="vox-final-appeal"
      role="dialog"
      aria-modal="true"
      aria-label="Final appeal to the audience"
    >
      <div className="vox-final-appeal__signal" aria-hidden="true">
        LIVE
      </div>
      <PlayerAvatar player={player} size="lg" showEvictedStyle={false} />
      <p className="vox-final-appeal__eyebrow">ONE LAST MESSAGE</p>
      <h2>How do you want the audience to remember this season?</h2>
      <p className="vox-final-appeal__intro">
        Your appeal can move a close vote. The audience still makes the final call.
      </p>
      <div className="vox-final-appeal__choices">
        {APPEALS.map((appeal) => (
          <button key={appeal.id} type="button" onClick={() => handleSelect(appeal.id)}>
            <span aria-hidden="true">{appeal.icon}</span>
            <strong>{appeal.title}</strong>
            <small>{appeal.copy}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
