/**
 * FinalTallyPanel — running vote counts per finalist.
 */
import type { Player } from '../../types';

interface Props {
  finalists: Player[];
  tally: Record<string, number>;
}

export default function FinalTallyPanel({ finalists, tally }: Props) {
  return (
    <div className="fo-tally">
      {finalists.map((f) => (
        <div key={f.id} className="fo-tally__item">
          <span className="fo-tally__name">
            {f.avatar} {f.name}
          </span>
          <span className="fo-tally__count">{tally[f.id] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}
