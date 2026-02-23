import './PreviewPopup.css';

export interface PreviewDeltaEntry {
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
          {deltas.map(({ targetName, delta }) => (
            <li
              key={targetName}
              className={`pp__entry pp__entry--${delta >= 0 ? 'pos' : 'neg'}`}
            >
              <span className="pp__name">{targetName}</span>
              <span className="pp__delta">
                {delta >= 0 ? '+' : ''}
                {delta}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
