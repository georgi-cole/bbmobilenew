/**
 * CompSelection — UI component for the Comp Selection game-settings feature.
 *
 * Renders a Selection Mode dropdown and, when mode is `single-game`, a
 * single-game picker populated from fetchGames().  All pool/list UI has been
 * removed; games are selected exclusively via the dropdowns.
 *
 * See specs/COMP_SELECTION.md for the full design spec.
 */

import { useState, useEffect } from 'react';
import {
  type CompGame,
  type CompSelectionMode,
  type CompSelectionPayload,
  type CompSelectionProps,
} from './compSelectionUtils';

export type { CompGame, CompSelectionMode, CompSelectionPayload, CompSelectionProps } from './compSelectionUtils';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * CompSelection renders the Comp Selection settings panel.
 *
 * Usage example (local dev / Storybook):
 * ```tsx
 * <CompSelection
 *   fetchGames={() => Promise.resolve(MOCK_GAMES)}
 *   onSave={(p) => console.log('saved', p)}
 * />
 * ```
 */
export default function CompSelection({
  fetchGames,
  onSave,
  initialPayload,
}: CompSelectionProps) {
  const [games, setGames] = useState<CompGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mode, setMode] = useState<CompSelectionMode>(
    initialPayload?.mode ?? 'random-games',
  );
  const [selectedGameId, setSelectedGameId] = useState<string>(
    initialPayload?.selectedGameId ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load games on mount (needed to populate the single-game dropdown)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetchGames()
      .then((data) => {
        if (cancelled) return;
        setGames(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load competitions.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [fetchGames]);

  const handleSave = async () => {
    const payload: CompSelectionPayload = {
      mode,
      ...(mode === 'single-game' && { selectedGameId }),
    };
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await onSave(payload);
      setSaveSuccess(true);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="comp-selection comp-selection--loading" aria-live="polite">
        Loading competitions…
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="comp-selection comp-selection--error" role="alert">
        <p>⚠️ {fetchError}</p>
      </div>
    );
  }

  return (
    <div className="comp-selection">
      <h2 className="comp-selection__title">🏆 Comp Selection</h2>
      <p className="comp-selection__subtitle">
        Choose which competitions can appear during the season.
      </p>

      {/* ── Selection mode ───────────────────────────────────────────── */}
      <div className="comp-selection__mode">
        <label className="comp-selection__mode-label">
          Selection Mode
          <select
            className="comp-selection__mode-select"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as CompSelectionMode);
              setSaveSuccess(false);
            }}
            aria-label="Selection mode"
          >
            <option value="random-games">Random (any game)</option>
            <option value="single-game">Single game</option>
            <option value="user-selection">User selection pool</option>
            <option value="arcade-only">Arcade only</option>
            <option value="trivia-only">Trivia only</option>
            <option value="endurance-only">Endurance only</option>
            <option value="logic-only">Logic only</option>
            <option value="retired">Retired games</option>
            <option value="misc">Misc</option>
            <option value="unique">Unique (no repeats)</option>
          </select>
        </label>
      </div>

      {/* ── Single-game key input ────────────────────────────────────── */}
      {mode === 'single-game' && (
        <div className="comp-selection__single-game">
          <label className="comp-selection__single-label">
            Game key (registry key)
            <select
              className="comp-selection__single-select"
              value={selectedGameId}
              onChange={(e) => {
                setSelectedGameId(e.target.value);
                setSaveSuccess(false);
              }}
              aria-label="Single game key"
            >
              <option value="">— pick a game —</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.id})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* ── Save feedback ─────────────────────────────────────────────── */}
      {saveError && (
        <p className="comp-selection__save-error" role="alert">⚠️ {saveError}</p>
      )}
      {saveSuccess && (
        <p className="comp-selection__save-success" aria-live="polite">✅ Saved!</p>
      )}

      {/* ── Save button ───────────────────────────────────────────────── */}
      <button
        className="comp-selection__save-btn"
        onClick={handleSave}
        disabled={saving}
        aria-busy={saving}
      >
        {saving ? 'Saving…' : 'Save Selection'}
      </button>
    </div>
  );
}

