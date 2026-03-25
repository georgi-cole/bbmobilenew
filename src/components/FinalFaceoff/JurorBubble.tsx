/**
 * JurorBubble — one juror's vote reveal tile.
 *
 * Supports a staged reveal:
 *   - Phase 1: juror card slides in with the clue message only.
 *   - Phase 2: vote chip (finalist) fades/scales in after `voteVisible` is true.
 *   - `isFlashing` triggers a brief highlight when the vote is attributed.
 *   - `isPublic` applies special public-vote gold/global styling.
 */
import type { Player } from '../../types';
import type { JurorReveal } from '../../store/finaleSlice';
import { PUBLIC_JUROR_ID } from '../../store/finaleSlice';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';

interface Props {
  juror: Player;
  finalist: Player | undefined;
  reveal: JurorReveal;
  /** When true the vote chip (finalist name) is shown. */
  voteVisible?: boolean;
  /** When true a flash/highlight ring fires to mark attribution. */
  isFlashing?: boolean;
}

export default function JurorBubble({ juror, finalist, reveal, voteVisible = true, isFlashing = false }: Props) {
  const isPublic = reveal.jurorId === PUBLIC_JUROR_ID;

  return (
    <div
      className={[
        'jb-bubble',
        isPublic ? 'jb-bubble--public' : '',
        isFlashing ? 'jb-bubble--flash' : '',
      ].filter(Boolean).join(' ')}
    >
      {isFlashing && <div className="jb-flash-ring" aria-hidden="true" />}
      <PlayerAvatar player={juror} size="sm" showRelationshipOutline={false} />
      <div className="jb-body">
        <span className="jb-name">
          {juror.name}
          {isPublic && <span className="jb-public-badge">Public Vote</span>}
        </span>
        <span className="jb-phrase">&ldquo;{reveal.phrase}&rdquo;</span>
        {finalist && voteVisible && (
          <span className={`jb-vote${isPublic ? ' jb-vote--public' : ''}`}>
            <PlayerAvatar player={finalist} size="sm" showRelationshipOutline={false} />
            <strong>{finalist.name}</strong>
          </span>
        )}
        {!voteVisible && (
          <span className="jb-vote-pending" aria-label="Vote not yet revealed">
            ···
          </span>
        )}
      </div>
    </div>
  );
}
