/**
 * JurorBubble — one juror's vote reveal tile.
 */
import type { Player } from '../../types';
import type { JurorReveal } from '../../store/finaleSlice';

interface Props {
  juror: Player;
  finalist: Player | undefined;
  reveal: JurorReveal;
}

export default function JurorBubble({ juror, finalist, reveal }: Props) {
  return (
    <div className="jb-bubble">
      <span className="jb-avatar">{juror.avatar}</span>
      <div className="jb-body">
        <span className="jb-name">{juror.name}</span>
        <span className="jb-phrase">{reveal.phrase}</span>
        {finalist && (
          <span className="jb-vote">
            {finalist.avatar} <strong>{finalist.name}</strong>
          </span>
        )}
      </div>
    </div>
  );
}
