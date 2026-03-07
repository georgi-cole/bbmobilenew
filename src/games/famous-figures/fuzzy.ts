/**
 * Fuzzy matching utilities for Famous Figures guess evaluation.
 *
 * Uses Damerau-Levenshtein distance (full, not restricted) so that
 * transpositions count as a single edit — e.g. "Enistein" → "Einstein".
 */
import type { FigureRow } from './model';

export const FUZZY_THRESHOLD_RATIO = 0.22;

/**
 * Normalise a string for matching:
 *   - Unicode NFD decomposition then remove combining/diacritic characters
 *   - Replace apostrophes/elision marks with spaces (handles "d'Arc" → "d arc")
 *   - Lowercase
 *   - Remove punctuation
 *   - Collapse whitespace
 *   - Remove common particles (de, da, del, di, von, van, al, ibn, el, of, the, d, l)
 */
export function normalizeForMatching(text: string): string {
  let s = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/['''\u2018\u2019\u201B`´\u2032\u2035]/g, ' ') // apostrophes/elisions (ASCII + typographic) → space
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // strip remaining punctuation/symbols
    .replace(/\s+/g, ' ')
    .trim();

  // Remove standalone particles (ordered longest-first to avoid partial matches)
  const particles = [
    '\\bdel\\b', '\\bvon\\b', '\\bvan\\b', '\\bibn\\b',
    '\\bthe\\b', '\\bde\\b', '\\bda\\b', '\\bdi\\b',
    '\\bal\\b', '\\bel\\b', '\\bof\\b', '\\bd\\b', '\\bl\\b',
  ];
  for (const p of particles) {
    s = s.replace(new RegExp(p, 'g'), '');
  }

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Full Damerau-Levenshtein distance (supports transpositions).
 * Time complexity O(|a|·|b|), space O(|a|·|b|).
 */
export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  // d[i][j] = DL distance of a[0..i-1] and b[0..j-1]
  const d: number[][] = Array.from({ length: la + 2 }, () =>
    new Array<number>(lb + 2).fill(0),
  );

  const maxDist = la + lb;
  d[0][0] = maxDist;
  for (let i = 0; i <= la; i++) {
    d[i + 1][0] = maxDist;
    d[i + 1][1] = i;
  }
  for (let j = 0; j <= lb; j++) {
    d[0][j + 1] = maxDist;
    d[1][j + 1] = j;
  }

  // Map char → last row where it appeared
  const charMap: Record<string, number> = {};

  for (let i = 1; i <= la; i++) {
    let db = 0; // last column where b[j-1] === a[i-1]
    for (let j = 1; j <= lb; j++) {
      const i1 = charMap[b[j - 1]] ?? 0;
      const j1 = db;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (cost === 0) db = j;

      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,                         // substitution / match
        d[i + 1][j] + 1,                         // insertion
        d[i][j + 1] + 1,                         // deletion
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1), // transposition
      );
    }
    charMap[a[i - 1]] = i;
  }

  return d[la + 1][lb + 1];
}

/**
 * Returns true if `input` is an accepted guess for the given figure.
 *
 * Rules:
 *  - Normalise the input.
 *  - Compare against the figure's normalizedName and each normalizedAlias.
 *  - If the normalised alias length ≤ 4, require an exact match.
 *  - Otherwise, allow DL distance ≤ Math.max(1, Math.floor(len * FUZZY_THRESHOLD_RATIO)).
 */
export function isAcceptedGuess(input: string, figure: FigureRow): boolean {
  const normInput = normalizeForMatching(input);
  if (normInput.length === 0) return false;

  const targets = [figure.normalizedName, ...figure.normalizedAliases];

  for (const target of targets) {
    if (target.length === 0) continue;

    if (target.length <= 4) {
      if (normInput === target) return true;
    } else {
      const threshold = Math.max(1, Math.floor(target.length * FUZZY_THRESHOLD_RATIO));
      if (damerauLevenshtein(normInput, target) <= threshold) return true;
    }
  }

  return false;
}
