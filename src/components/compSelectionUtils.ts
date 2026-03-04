/**
 * compSelectionUtils — shared types, constants, and validation helper for the
 * Comp Selection feature.
 *
 * Kept in a separate module so CompSelection.tsx satisfies the
 * react-refresh/only-export-components lint rule (component files must only
 * export React components).
 */

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

/** Result returned by validateCompSelection(). */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<CompGame['category'], string> = {
  physical: '💪 Physical',
  mental: '🧠 Mental',
  endurance: '⏱️ Endurance',
  social: '🤝 Social',
  mixed: '🎲 Mixed',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as Array<CompGame['category']>;

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Client-side validation for a CompSelectionPayload.
 *
 * Rules expressible in draft-07 JSON Schema (see src/api/schema/comp_selection.json)
 * are mirrored here: `enabledIds` non-empty, items non-empty string, unique.
 * Rules that require application logic (known IDs only, weeklyLimit <=
 * enabledIds.length, filterCategory enum check) are also enforced here but
 * cannot be expressed in the JSON schema alone.
 */
export function validateCompSelection(
  payload: CompSelectionPayload,
  allGames: CompGame[],
): ValidationResult {
  const errors: string[] = [];

  if (payload.enabledIds.length === 0) {
    errors.push('At least one competition must be enabled.');
  }

  // Enforce non-empty string IDs (schema: minLength >= 1 for enabledIds items).
  const emptyIds = payload.enabledIds.filter((id) => id === '');
  if (emptyIds.length > 0) {
    errors.push('Enabled competition IDs must be non-empty strings.');
  }

  // Enforce uniqueness of IDs (schema: uniqueItems: true for enabledIds).
  const seenIds = new Set<string>();
  const duplicateIds = payload.enabledIds.filter((id) => {
    if (seenIds.has(id)) return true;
    seenIds.add(id);
    return false;
  });
  if (duplicateIds.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateIds));
    errors.push(`Duplicate game ID(s) in enabledIds: ${uniqueDuplicates.join(', ')}.`);
  }

  // Enforce known IDs (application logic — not representable in JSON Schema).
  // Skip empty-string IDs here to avoid double-reporting (already flagged above).
  const knownIds = new Set(allGames.map((g) => g.id));
  const unknownIds = payload.enabledIds.filter((id) => id !== '' && !knownIds.has(id));
  if (unknownIds.length > 0) {
    errors.push(`Unknown game ID(s): ${unknownIds.join(', ')}.`);
  }

  if (payload.weeklyLimit !== null) {
    if (!Number.isInteger(payload.weeklyLimit) || payload.weeklyLimit < 1) {
      errors.push('Weekly limit must be a positive integer or null (no limit).');
    }
    // Application logic constraint: weeklyLimit <= enabledIds.length.
    if (payload.weeklyLimit > payload.enabledIds.length) {
      errors.push('Weekly limit cannot exceed the number of enabled competitions.');
    }
  }

  // Enforce filterCategory enum (application logic — category list is dynamic).
  if (
    payload.filterCategory !== null &&
    !ALL_CATEGORIES.includes(payload.filterCategory as CompGame['category'])
  ) {
    errors.push(
      `Invalid filterCategory "${String(payload.filterCategory)}". Expected one of: ${ALL_CATEGORIES.join(', ')} or null.`,
    );
  }

  return { valid: errors.length === 0, errors };
}
