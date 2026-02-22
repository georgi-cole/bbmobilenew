import { useState, useCallback } from 'react';
import type { Player } from '../../types';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import TvStingerOverlay from '../TvStingerOverlay/TvStingerOverlay';
import './TvDecisionModal.css';

interface Props {
  title: string;
  subtitle?: string;
  options: Player[];
  onSelect: (playerId: string) => void;
  danger?: boolean;
  /** Label shown on the confirm button. Default: "Confirm" */
  confirmLabel?: string;
  /** Label shown on the back/change button. Default: "Change" */
  cancelLabel?: string;
  /** Stinger message shown after confirm. Default: "Decision locked in!" */
  stingerMessage?: string;
}

/** Small avatar image with emoji fallback for use inside decision options. */
function OptionAvatar({ player }: { player: Player }) {
  const [src, setSrc] = useState(() => resolveAvatar(player));
  const [showEmoji, setShowEmoji] = useState(false);

  function handleError() {
    const dicebear = getDicebear(player.name);
    if (src !== dicebear) {
      setSrc(dicebear);
    } else {
      setShowEmoji(true);
    }
  }

  if (showEmoji) {
    return (
      <span className="tv-decision-modal__option-avatar" aria-hidden="true">
        {player.avatar}
      </span>
    );
  }
  return (
    <img
      className="tv-decision-modal__option-avatar tv-decision-modal__option-avatar--img"
      src={src}
      alt={player.name}
      onError={handleError}
      aria-hidden="true"
    />
  );
}

/**
 * TvDecisionModal — a TV-contained modal prompting the human player to select
 * a houseguest. Used for:
 *   - HOH replacement nominee selection (after POV auto-save)
 *   - Final 4 eviction vote (human POV holder)
 *   - Final 3 Final HOH eviction
 *
 * Two-step confirm flow: first tap selects (highlights) an option; the player
 * must then press Confirm to commit. A brief stinger overlay is shown before
 * the action is dispatched to add pacing and suspense.
 *
 * These decisions are MANDATORY — the game cannot progress without a
 * selection. There is intentionally no Escape key or cancel mechanism.
 */
export default function TvDecisionModal({
  title,
  subtitle,
  options,
  onSelect,
  danger = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Change',
  stingerMessage = 'Decision locked in!',
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStinger, setShowStinger] = useState(false);

  function handleOptionClick(playerId: string) {
    setSelectedId(playerId);
  }

  function handleConfirm() {
    if (selectedId) {
      setShowStinger(true);
    }
  }

  const handleStingerDone = useCallback(() => {
    if (selectedId) {
      onSelect(selectedId);
    }
  }, [selectedId, onSelect]);

  const selectedPlayer = options.find((p) => p.id === selectedId);

  return (
    <>
      <div className="tv-decision-modal" role="dialog" aria-modal="true" aria-labelledby="tvdm-title">
        <div className="tv-decision-modal__card">
          <header className="tv-decision-modal__header">
            <h2 className="tv-decision-modal__title" id="tvdm-title">{title}</h2>
            {subtitle && <p className="tv-decision-modal__subtitle">{subtitle}</p>}
          </header>

          <div className="tv-decision-modal__body">
            {options.length === 0 ? (
              <p className="tv-decision-modal__empty">
                No eligible houseguests available. Use the Debug Panel to fix game state.
              </p>
            ) : (
              options.map((player) => {
                const isSelected = player.id === selectedId;
                return (
                  <button
                    key={player.id}
                    className={[
                      'tv-decision-modal__option',
                      danger ? 'tv-decision-modal__option--danger' : '',
                      isSelected ? 'tv-decision-modal__option--selected' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleOptionClick(player.id)}
                    aria-pressed={isSelected}
                    type="button"
                  >
                    <OptionAvatar player={player} />
                    <span className="tv-decision-modal__option-name">{player.name}</span>
                    <span className="tv-decision-modal__option-tag">{player.status}</span>
                  </button>
                );
              })
            )}
          </div>

          {selectedPlayer && (
            <footer className="tv-decision-modal__footer">
              <button
                className="tv-decision-modal__btn-change"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                {cancelLabel}
              </button>
              <button
                className={[
                  'tv-decision-modal__btn-confirm',
                  danger ? 'tv-decision-modal__btn-confirm--danger' : '',
                ].filter(Boolean).join(' ')}
                onClick={handleConfirm}
                type="button"
              >
                {confirmLabel}: <strong>{selectedPlayer.name}</strong>
              </button>
            </footer>
          )}
        </div>
      </div>

      {showStinger && (
        <TvStingerOverlay message={stingerMessage} onDone={handleStingerDone} />
      )}
    </>
  );
}
