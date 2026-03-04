/**
 * CompSelection — draft UI component for the Comp Selection game-settings feature.
 *
 * WIP / exploratory: this component is intentionally self-contained and uses
 * dependency injection for fetchGames() and onSave() so it can be exercised
 * locally without any server changes.
 *
 * See specs/COMP_SELECTION.md for the full design spec.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  validateCompSelection,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
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
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    new Set(initialPayload?.enabledIds ?? []),
  );
  const [weeklyLimit, setWeeklyLimit] = useState<number | null>(
    initialPayload?.weeklyLimit ?? null,
  );
  const [filterCategory, setFilterCategory] = useState<CompGame['category'] | null>(
    initialPayload?.filterCategory ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Stable boolean flag: true when an initial selection was provided by the
  // caller.  Using Boolean() avoids array-identity re-runs when the caller
  // passes `initialPayload={{ enabledIds: [...] }}` inline.
  const hasInitialIds = Boolean(initialPayload?.enabledIds);

  // Load games on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    fetchGames()
      .then((data) => {
        if (cancelled) return;
        setGames(data);
        // If no initial selection, default to whatever the server marks enabled.
        if (!hasInitialIds) {
          setEnabledIds(new Set(data.filter((g) => g.enabled).map((g) => g.id)));
        }
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
  }, [fetchGames, hasInitialIds]);

  const toggleGame = useCallback((id: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setValidationErrors([]);
    setSaveSuccess(false);
  }, []);

  const handleSelectAll = useCallback(() => {
    setEnabledIds(new Set(games.map((g) => g.id)));
    setValidationErrors([]);
  }, [games]);

  const handleSelectNone = useCallback(() => {
    setEnabledIds(new Set());
    setValidationErrors([]);
  }, []);

  const handleSave = useCallback(async () => {
    const payload: CompSelectionPayload = {
      mode,
      enabledIds: Array.from(enabledIds),
      weeklyLimit,
      filterCategory,
      ...(mode === 'single-game' && { selectedGameId }),
      ...(mode === 'user-selection' && { selectedGameIds: Array.from(enabledIds) }),
    };
    const result = validateCompSelection(payload, games);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
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
  }, [mode, selectedGameId, enabledIds, weeklyLimit, filterCategory, games, onSave]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const visibleGames = filterCategory
    ? games.filter((g) => g.category === filterCategory)
    : games;

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
              setValidationErrors([]);
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
                setValidationErrors([]);
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

      {/* ── Category filter ──────────────────────────────────────────── */}
      <div className="comp-selection__filters" role="group" aria-label="Filter by category">
        <button
          className={`comp-selection__filter-btn${filterCategory === null ? ' comp-selection__filter-btn--active' : ''}`}
          onClick={() => setFilterCategory(null)}
          aria-pressed={filterCategory === null}
        >
          All
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`comp-selection__filter-btn${filterCategory === cat ? ' comp-selection__filter-btn--active' : ''}`}
            onClick={() => setFilterCategory(cat)}
            aria-pressed={filterCategory === cat}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* ── Bulk actions ─────────────────────────────────────────────── */}
      <div className="comp-selection__bulk">
        <button
          className="comp-selection__bulk-btn"
          onClick={handleSelectAll}
          aria-label="Enable all competitions"
        >
          Select all
        </button>
        <button
          className="comp-selection__bulk-btn"
          onClick={handleSelectNone}
          aria-label="Disable all competitions"
        >
          Select none
        </button>
        <span className="comp-selection__count" aria-live="polite">
          {enabledIds.size} / {games.length} enabled
        </span>
      </div>

      {/* ── Game list ─────────────────────────────────────────────────── */}
      <ul className="comp-selection__list" role="list">
        {visibleGames.map((game) => (
          <li key={game.id} className="comp-selection__item">
            <label className="comp-selection__label">
              <input
                type="checkbox"
                className="comp-selection__checkbox"
                checked={enabledIds.has(game.id)}
                onChange={() => toggleGame(game.id)}
                aria-label={`Toggle ${game.name}`}
              />
              <span className="comp-selection__icon" aria-hidden="true">{game.icon}</span>
              <span className="comp-selection__name">{game.name}</span>
              <span className="comp-selection__category">{CATEGORY_LABELS[game.category]}</span>
            </label>
          </li>
        ))}
        {visibleGames.length === 0 && (
          <li className="comp-selection__empty">No competitions in this category.</li>
        )}
      </ul>

      {/* ── Weekly limit ─────────────────────────────────────────────── */}
      <div className="comp-selection__weekly-limit">
        <label className="comp-selection__weekly-label">
          Weekly Comp Limit
          <input
            type="number"
            className="comp-selection__weekly-input"
            min={1}
            max={games.length || 1}
            value={weeklyLimit ?? ''}
            placeholder="No limit"
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setWeeklyLimit(null);
                setValidationErrors([]);
                return;
              }
              const parsed = parseInt(raw, 10);
              if (Number.isNaN(parsed)) {
                // Ignore invalid numeric input; keep previous value.
                return;
              }
              setWeeklyLimit(parsed);
              setValidationErrors([]);
            }}
            aria-label="Maximum competitions per week (leave blank for no limit)"
          />
        </label>
        <p className="comp-selection__helper-text">
          Leave blank to allow all enabled comps; set a number to randomly draw
          that many each week.
        </p>
      </div>

      {/* ── Validation errors ─────────────────────────────────────────── */}
      {validationErrors.length > 0 && (
        <ul className="comp-selection__errors" role="alert">
          {validationErrors.map((err) => (
            <li key={err}>⚠️ {err}</li>
          ))}
        </ul>
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

