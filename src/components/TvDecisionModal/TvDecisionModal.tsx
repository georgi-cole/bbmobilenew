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
  /**
   * Message shown in the stinger overlay after the player confirms.
   * Tailor this to the decision context — e.g. "Vote locked in!" for
   * eviction votes or "Nominee recorded!" for nomination ceremonies.
   * Default: "Decision locked in!"
   */
  stingerMessage?: string;
}

/** Small avatar image with emoji fallback for use inside decision options. */
function OptionAvatar({ player }: { player: Player }) {
  const [showEmoji, setShowEmoji] = useState(false);

  function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    img.onerror = null; // mute native handler to prevent double-firing
    const dicebear = getDicebear(player.name);
    if (img.src !== dicebear) {
      // Step 2: try Dicebear pixel-art fallback
      img.src = dicebear;
      img.onerror = () => setShowEmoji(true); // Step 3: emoji if Dicebear also fails
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
      src={resolveAvatar(player)}
      alt=""
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

  // Derive the selected player from the current options list.
  // If options change (e.g. game state updates) and the previously-selected
  // player is no longer available, selectedPlayer becomes undefined and the
  // footer is hidden automatically — no stale selection can be committed.
  const selectedPlayer = options.find((p) => p.id === selectedId);

  function handleOptionClick(playerId: string) {
    setSelectedId(playerId);
  }

  function handleConfirm() {
    if (selectedPlayer) {
      setShowStinger(true);
    }
  }

  const handleStingerDone = useCallback(() => {
    if (selectedPlayer) {
      onSelect(selectedPlayer.id);
    }
  }, [selectedPlayer, onSelect]);

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
                {confirmLabel}: <span className="tv-decision-modal__btn-confirm-name">{selectedPlayer.name}</span>
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
