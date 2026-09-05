/**
 * JurorBubble — one juror's vote reveal tile.
 *
 * Used in the 'revealVotes' (phase 2) act of FinalFaceoff.
 *
 * When `voteVisible` is false the vote line is replaced with a pending
 * indicator.  Once the vote is revealed the tile shows the clean format:
 *   "[Juror name] cast a vote for [Finalist name]"
 *
 * - `isFlashing` triggers a brief highlight when the vote is attributed.
 * - `isPublic` applies special public-vote gold/global styling.
 */
import type { Player } from '../../types'
import type { JurorReveal } from '../../store/finaleSlice'
import { PUBLIC_JUROR_ID } from '../../store/finaleSlice'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import { useAppSelector } from '../../store/hooks'

interface Props {
  juror: Player
  finalist: Player | undefined
  reveal: JurorReveal
  /** When true the vote is shown. */
  voteVisible?: boolean
  /** When true a flash/highlight ring fires to mark attribution. */
  isFlashing?: boolean
}

export default function JurorBubble({
  juror,
  finalist,
  reveal,
  voteVisible = true,
  isFlashing = false,
}: Props) {
  const isPublic = reveal.jurorId === PUBLIC_JUROR_ID
  const publicVoteWeight = useAppSelector((state) => state.finale.publicVoteWeight ?? 1)
  const voteWeight = isPublic ? publicVoteWeight : 1

  return (
    <div
      className={[
        'jb-bubble',
        isPublic ? 'jb-bubble--public' : '',
        isFlashing ? 'jb-bubble--flash' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-juror-id={juror.id}
    >
      {isFlashing && <div className="jb-flash-ring" aria-hidden="true" />}
      <PlayerAvatar
        player={juror}
        size="sm"
        showRelationshipOutline={false}
        showEvictedStyle={false}
      />
      <div className="jb-body">
        <span className="jb-name">
          {juror.name}
          {isPublic && (
            <span className="jb-public-badge">Public Vote{voteWeight === 2 ? ' ×2' : ''}</span>
          )}
        </span>

        {/* Phase-2 vote reveal: "X cast a vote for Y" */}
        {voteVisible && finalist ? (
          <span
            className={`jb-vote-statement${isPublic ? ' jb-vote-statement--public' : ''}`}
            aria-label={`${juror.name} cast ${voteWeight === 2 ? 'two votes' : 'a vote'} for ${finalist.name}`}
          >
            cast {voteWeight === 2 ? 'two votes' : 'a vote'} for{' '}
            <span className="jb-vote-statement__finalist">
              <PlayerAvatar player={finalist} size="sm" showRelationshipOutline={false} />
              <strong>{finalist.name}</strong>
            </span>
          </span>
        ) : (
          <span className="jb-vote-pending" aria-label="Vote not yet revealed">
            ···
          </span>
        )}
      </div>
    </div>
  )
}
