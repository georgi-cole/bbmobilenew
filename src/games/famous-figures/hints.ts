/**
 * Hint ladder utilities for Famous Figures.
 *
 * Hint ladder (0-based index):
 *   0  →  dataset hints[0]  — big content clue
 *   1  →  dataset hints[1]  — another big content clue
 *   2  →  generated          — "First name starts with 'X'"
 *   3  →  generated          — "Last name starts with 'Y'" (mononym fallback)
 *   4  →  generated          — "Either first name (X, N letters) or last name (Y, M letters)"
 */
import type { FigureRow } from './model';

/**
 * Parses a canonical name into first / last components.
 * Handles mononyms (e.g. "Cleopatra") and regnal names (e.g. "Louis XIV").
 */
function parseNameParts(canonicalName: string): {
  first: string;
  last: string;
  isMononym: boolean;
} {
  const parts = canonicalName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0], last: '', isMononym: true };
  }
  return { first: parts[0], last: parts[parts.length - 1], isMononym: false };
}

/**
 * Returns the display text for the hint at `hintIndex` (0-based).
 *
 * Indices 0 and 1 return the dataset hints directly.
 * Indices 2–4 are generated from the figure's canonical name.
 */
export function getHintText(figure: FigureRow, hintIndex: number): string {
  if (hintIndex === 0) return figure.hints[0];
  if (hintIndex === 1) return figure.hints[1];

  const { first, last, isMononym } = parseNameParts(figure.canonicalName);
  const firstInitial = (first[0] ?? '?').toUpperCase();

  if (hintIndex === 2) {
    return isMononym
      ? `Name starts with '${firstInitial}'`
      : `First name starts with '${firstInitial}'`;
  }

  if (hintIndex === 3) {
    if (isMononym) {
      return `Name has ${first.length} letters`;
    }
    const lastInitial = (last[0] ?? '?').toUpperCase();
    return `Last name starts with '${lastInitial}'`;
  }

  // hintIndex === 4  (Hint 5)
  if (isMononym) {
    return `Either this person goes by one name — ${first.length} letters starting with '${firstInitial}'`;
  }
  const lastInitial = (last[0] ?? '?').toUpperCase();
  return `Either first name (starts with '${firstInitial}', ${first.length} letters) or last name (starts with '${lastInitial}', ${last.length} letters)`;
}
