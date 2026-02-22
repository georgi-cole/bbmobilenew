import { useState, useCallback } from 'react';
import type { Player } from '../../types';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import TvStingerOverlay from '../TvStingerOverlay/TvStingerOverlay';
import './TvMultiSelectModal.css';

interface Props {
  title: string;
  subtitle?: string;
  options: Player[];
  /** How many players must be selected before Confirm is enabled. Default: 2 */
  maxSelect?: number;
  /** Called with the array of selected player IDs once confirmed */
  onConfirm: (selectedIds: string[]) => void;
  /** Label shown on the confirm button */
  confirmLabel?: string;
  /** Message shown in the stinger overlay after confirming */
  stingerMessage?: string;
}

/**
 * TvMultiSelectModal — prompts the human player to select `maxSelect` players
 * in a single step. Designed for the nomination ceremony where the HOH picks
 * two nominees simultaneously.
 *
 * Two-step flow:
 *  1. Tap players to toggle selection (up to maxSelect)
 *  2. Confirm button is enabled only when exactly maxSelect are chosen
 *  3. Stinger plays, then onConfirm is called with the selected IDs
 */
export default function TvMultiSelectModal({
  title,
  subtitle,
  options,
  maxSelect = 2,
  onConfirm,
  confirmLabel = 'Confirm Nominees',
  stingerMessage = 'NOMINATIONS SET',
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showStinger, setShowStinger] = useState(false);

  function togglePlayer(playerId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length < maxSelect) {
        return [...prev, playerId];
      }
      // Already at max — swap out the first selection
      return [...prev.slice(1), playerId];
    });
  }

  const canConfirm = selectedIds.length === maxSelect;

  function handleConfirm() {
    if (canConfirm) setShowStinger(true);
  }

  const handleStingerDone = useCallback(() => {
    onConfirm(selectedIds);
  }, [selectedIds, onConfirm]);

  const selectedPlayers = options.filter((p) => selectedIds.includes(p.id));

  return (
    <>
      <div
        className="tv-ms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tvms-title"
      >
        <div className="tv-ms-modal__card">
          <header className="tv-ms-modal__header">
            <h2 className="tv-ms-modal__title" id="tvms-title">
              {title}
            </h2>
            {subtitle && <p className="tv-ms-modal__subtitle">{subtitle}</p>}
            <p className="tv-ms-modal__counter">
              {selectedIds.length} / {maxSelect} selected
            </p>
          </header>

          <div className="tv-ms-modal__body">
            {options.length === 0 ? (
              <p className="tv-ms-modal__empty">
                No eligible houseguests available.
              </p>
            ) : (
              options.map((player) => {
                const isSelected = selectedIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    className={[
                      'tv-ms-modal__option',
                      isSelected ? 'tv-ms-modal__option--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => togglePlayer(player.id)}
                    aria-pressed={isSelected}
                    type="button"
                  >
                    <PlayerAvatar player={player} selected={isSelected} size="sm" />
                    <span className="tv-ms-modal__option-name">{player.name}</span>
                    <span className="tv-ms-modal__option-tag">{player.status}</span>
                    {isSelected && (
                      <span className="tv-ms-modal__check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <footer className="tv-ms-modal__footer">
            {selectedPlayers.length > 0 && (
              <div className="tv-ms-modal__preview">
                Nominees: {selectedPlayers.map((p) => p.name).join(' & ')}
              </div>
            )}
            <button
              className={[
                'tv-ms-modal__btn-confirm',
                !canConfirm ? 'tv-ms-modal__btn-confirm--disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={handleConfirm}
              disabled={!canConfirm}
              type="button"
            >
              {confirmLabel}
            </button>
          </footer>
        </div>
      </div>

      {showStinger && (
        <TvStingerOverlay message={stingerMessage} onDone={handleStingerDone} />
      )}
    </>
  );
}
