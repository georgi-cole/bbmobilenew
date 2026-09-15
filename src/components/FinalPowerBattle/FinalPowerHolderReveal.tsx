import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import './FinalPowerBattle.css'

interface Props {
  player: Player
  mode: 'classic' | 'vox_populi'
  continueCopy: string
  modal?: boolean
}

export default function FinalPowerHolderReveal({
  player,
  mode,
  continueCopy,
  modal = true,
}: Props) {
  return (
    <section
      className="fp-holder-reveal"
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal ? true : undefined}
      aria-label={`${player.name}, Final Power holder`}
    >
      <div className="fp-holder-reveal__spotlight" aria-hidden="true" />
      <p className="fp-holder-reveal__network">THE BIG EYE · FINALE NIGHT</p>
      <div className="fp-holder-reveal__portrait" aria-hidden="true">
        <FullSizeCutoutImage player={player} attire="informal" alt="" />
      </div>
      <div className="fp-holder-reveal__copy">
        <p className="fp-holder-reveal__eyebrow">
          {mode === 'vox_populi' ? 'FINAL IMMUNITY' : 'FINAL POWER HOLDER'}
        </p>
        <h2>{player.name}</h2>
        <p>
          {mode === 'vox_populi'
            ? 'The audience will now decide the last place in the Final Two.'
            : 'The power to decide the Final Two is now theirs.'}
        </p>
      </div>
      <p className="fp-holder-reveal__continue">{continueCopy}</p>
    </section>
  )
}
