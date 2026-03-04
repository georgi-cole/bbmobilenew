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

// ── Types ─────────────────────────────────────────────────────────────────────

/** A competition entry returned by fetchGames(). */
export interface CompGame {
  /** Stable machine-readable identifier (e.g. "tap-race", "trivia-blitz"). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Emoji icon for visual identification. */
  icon: string;
  /** Broad category used for filtering (e.g. "physical", "mental", "endurance"). */
  category: 'physical' | 'mental' | 'endurance' | 'social' | 'mixed';
  /** Whether this game is currently enabled in the simulation. */
  enabled: boolean;
}

/** Shape of the save payload sent to onSave(). */
export interface CompSelectionPayload {
  /** IDs of games the user has toggled ON. */
  enabledIds: string[];
  /**
   * Optional maximum number of comps to pick each week.
   * null = no limit (use all enabled).
   */
  weeklyLimit: number | null;
  /** Active filter category, or null for "all". */
  filterCategory: CompGame['category'] | null;
}

/** Props accepted by the CompSelection component. */
export interface CompSelectionProps {
  /**
   * Async function that resolves to the list of available comp games.
   * Injected so callers can mock or provide real API data.
   */
  fetchGames: () => Promise<CompGame[]>;
  /**
   * Called when the user saves their selection.
   * The component does not perform any persistence itself.
   */
  onSave: (payload: CompSelectionPayload) => Promise<void> | void;
  /** Optional initial payload to pre-populate the form. */
  initialPayload?: Partial<CompSelectionPayload>;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Client-side validation for a CompSelectionPayload.
 * Mirrors the constraints in src/api/schema/comp_selection.json.
 */
export function validateCompSelection(
  payload: CompSelectionPayload,
  allGames: CompGame[],
): ValidationResult {
  const errors: string[] = [];

  if (payload.enabledIds.length === 0) {
    errors.push('At least one competition must be enabled.');
  }

  const knownIds = new Set(allGames.map((g) => g.id));
  const unknownIds = payload.enabledIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    errors.push(`Unknown game ID(s): ${unknownIds.join(', ')}.`);
  }

  if (payload.weeklyLimit !== null) {
    if (!Number.isInteger(payload.weeklyLimit) || payload.weeklyLimit < 1) {
      errors.push('Weekly limit must be a positive integer or null (no limit).');
    }
    if (payload.weeklyLimit > payload.enabledIds.length) {
      errors.push(
        'Weekly limit cannot exceed the number of enabled competitions.',
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<CompGame['category'], string> = {
  physical:  '💪 Physical',
  mental:    '🧠 Mental',
  endurance: '⏱️ Endurance',
  social:    '🤝 Social',
  mixed:     '🎲 Mixed',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<CompGame['category']>;

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
        if (!initialPayload?.enabledIds) {
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
  }, [fetchGames, initialPayload?.enabledIds]);

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
      enabledIds:     Array.from(enabledIds),
      weeklyLimit,
      filterCategory,
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
  }, [enabledIds, weeklyLimit, filterCategory, games, onSave]);

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
              const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
              setWeeklyLimit(val);
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
