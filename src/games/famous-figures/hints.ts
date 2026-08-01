/**
 * Hint ladder utilities for Famous Figures.
 *
 * Dataset hints are curated from broad to specific for all five reveal steps.
 * Older or incomplete rows can still fall back to generated name clues.
 */
import type { FigureRow } from './model';

const KNOWN_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi']);

/**
 * Parses a canonical name into first / last components.
 * Handles mononyms, regnal names, and names with generational suffixes.
 */
function parseNameParts(canonicalName: string): {
  first: string;
  last: string;
  isMononym: boolean;
} {
  const raw = canonicalName.trim().split(/\s+/);

  const lastToken = raw[raw.length - 1] ?? '';
  const parts =
    raw.length > 1 && KNOWN_SUFFIXES.has(lastToken.toLowerCase().replace(/\.$/, ''))
      ? raw.slice(0, -1)
      : raw;

  if (parts.length === 1) {
    return { first: parts[0], last: '', isMononym: true };
  }
  return { first: parts[0], last: parts[parts.length - 1], isMononym: false };
}

/**
 * Final name clue shown after the four useful curated hints. Two leading
 * letters preserve a small challenge while still making the last guess fair.
 */
export function getFinalNameHintText(figure: FigureRow): string {
  const { first, isMononym } = parseNameParts(figure.canonicalName);
  const prefix = first.slice(0, 2) || '?';
  return isMononym
    ? `Name starts with '${prefix}'`
    : `First name starts with '${prefix}'`;
}

/**
 * Returns the display text for the hint at `hintIndex` (0-based).
 */
export function getHintText(figure: FigureRow, hintIndex: number): string {
  if (hintIndex < 0 || hintIndex > 4) {
    throw new RangeError(`getHintText: hintIndex must be 0-4, got ${hintIndex}`);
  }

  const datasetHint = figure.hints[hintIndex];
  if (typeof datasetHint === 'string' && datasetHint.trim().length > 0) {
    return datasetHint;
  }

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

  if (isMononym) {
    return `Name: ${first}`;
  }
  const lastInitial = (last[0] ?? '?').toUpperCase();
  return `First name: ${first}. Last name starts with '${lastInitial}'.`;
}

