import './PreviewPopup.css';

export interface PreviewDeltaEntry {
  /** Stable unique id for the target player; used as the React list key. */
  targetId: string;
  targetName: string;
  delta: number;
}

interface PreviewPopupProps {
  /** Per-target delta list. Empty array → "Select target(s) to preview" instruction. */
  deltas: PreviewDeltaEntry[];
}

/**
 * PreviewPopup — displays per-target affinity deltas for a hovered/focused action.
 *
 * Rendered inline below the ActionGrid. When `deltas` is empty, shows a brief
 * instruction telling the user to select targets first.
 */
export default function PreviewPopup({ deltas }: PreviewPopupProps) {
  return (
    <div className="pp" role="status" aria-live="polite" aria-label="Action preview">
      {deltas.length === 0 ? (
        <span className="pp__instruction">Select target(s) to preview</span>
      ) : (
        <ul className="pp__list">
          {deltas.map(({ targetId, targetName, delta }) => {
            const pct = Math.round(delta * 100);
            return (
              <li
                key={targetId}
                className={`pp__entry pp__entry--${delta >= 0 ? 'pos' : 'neg'}`}
              >
                <span className="pp__name">{targetName}</span>
                <span className="pp__delta">
                  {pct > 0 ? '+' : ''}
                  {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
