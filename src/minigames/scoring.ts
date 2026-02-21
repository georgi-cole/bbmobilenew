// MODULE: src/minigames/scoring.ts
// Scoring adapters that normalize raw minigame outputs into canonical
// higher-is-better scores and optional points awarded.
//
// Adapter contract:
//   computeScore(rawValue, options) → { score: number; points: number }
//   score  – canonical 0–1000 value (higher is always better after normalisation)
//   points – integer points awarded (for leaderboard / TV feed)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdapterResult {
  /** Canonical score in the range [0, 1000]. Higher is always better. */
  score: number;
  /** Points awarded (rounded integer, suitable for display). */
  points: number;
}

export interface RawResult {
  playerId: string;
  /** Raw value as returned by the minigame (taps, ms, accuracy 0-100, etc.). */
  rawValue: number;
  /** When true the game itself nominated this player as winner. */
  authoritativeWinner?: boolean;
}

export interface ScoringOptions {
  /** For 'timeToPoints' / 'lowerBetter': ideal (best) time in ms. */
  targetMs?: number;
  /** For 'timeToPoints' / 'lowerBetter': worst acceptable time in ms. */
  maxMs?: number;
  /** For 'rankPoints': points per rank position [1st, 2nd, 3rd, ...]. */
  rankScores?: number[];
  /** For 'binary': threshold rawValue that counts as a win. */
  threshold?: number;
  /** Min raw value expected (used for 'raw' normalization). */
  minRaw?: number;
  /** Max raw value expected (used for 'raw' normalization). */
  maxRaw?: number;
}

// ─── Individual adapters ──────────────────────────────────────────────────────

/** Normalize a raw score that is already higher-is-better (e.g. tap count, accuracy 0–100). */
function adapterRaw(rawValue: number, opts: ScoringOptions = {}): AdapterResult {
  const min = opts.minRaw ?? 0;
  const max = opts.maxRaw ?? 100;
  const clamped = Math.max(min, Math.min(max, rawValue));
  const score = max === min ? 0 : Math.round(((clamped - min) / (max - min)) * 1000);
  return { score, points: Math.round(clamped) };
}

/** Assign rank-based points (first place gets most points). */
function adapterRankPoints(rank: number, opts: ScoringOptions = {}): AdapterResult {
  const table = opts.rankScores ?? [500, 300, 150, 75, 25];
  const points = table[rank - 1] ?? 0;
  // Score inversely proportional to rank
  const score = Math.max(0, 1000 - (rank - 1) * 200);
  return { score, points };
}

/** Convert a time measurement (ms) where lower is better into a canonical score. */
function adapterTimeToPoints(timeMs: number, opts: ScoringOptions = {}): AdapterResult {
  const target = opts.targetMs ?? 1000;
  const max = opts.maxMs ?? 10000;
  if (timeMs <= target) return { score: 1000, points: 100 };
  if (timeMs >= max) return { score: 0, points: 0 };
  const k = Math.log(1000 / 1) / (max - target);
  const score = Math.round(1000 * Math.exp(-k * (timeMs - target)));
  return { score, points: Math.round(score / 10) };
}

/** Alias for timeToPoints — explicitly named to clarify intent. */
const adapterLowerBetter = adapterTimeToPoints;

/** Binary win/loss adapter: rawValue >= threshold → win. */
function adapterBinary(rawValue: number, opts: ScoringOptions = {}): AdapterResult {
  const threshold = opts.threshold ?? 1;
  const win = rawValue >= threshold;
  return { score: win ? 1000 : 0, points: win ? 100 : 0 };
}

/**
 * Authoritative adapter: the game nominated a winner via authoritativeWinner.
 * The raw value is preserved as score; caller must pass authoritativeWinner flag
 * separately via `normalizeForRanking`.
 */
function adapterAuthoritative(rawValue: number): AdapterResult {
  // Treat rawValue as a 0–1000 score already (game is responsible for scaling).
  const score = Math.max(0, Math.min(1000, Math.round(rawValue)));
  return { score, points: Math.round(score / 10) };
}

// ─── Dispatch table ───────────────────────────────────────────────────────────

const ADAPTERS: Record<
  string,
  (rawValue: number, opts: ScoringOptions) => AdapterResult
> = {
  raw: adapterRaw,
  rankPoints: (rawValue, opts) => adapterRankPoints(Math.round(rawValue), opts),
  timeToPoints: adapterTimeToPoints,
  lowerBetter: adapterLowerBetter,
  binary: adapterBinary,
  authoritative: (rawValue) => adapterAuthoritative(rawValue),
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the canonical score for a single player's raw result.
 *
 * @param adapter - One of the scoring adapter names.
 * @param rawValue - Raw value from the minigame.
 * @param options - Optional adapter-specific parameters.
 */
export function computeScore(
  adapter: string,
  rawValue: number,
  options: ScoringOptions = {},
): AdapterResult {
  const fn = ADAPTERS[adapter] ?? adapterRaw;
  return fn(rawValue, options);
}

/**
 * Compute canonical scores for all participants and return them sorted by score
 * (highest first), augmenting each result with rank and adapter output.
 *
 * @param adapter - Scoring adapter name.
 * @param rawResults - Array of raw results keyed by player ID.
 * @param options - Optional adapter-specific parameters.
 */
export function computeScores(
  adapter: string,
  rawResults: RawResult[],
  options: ScoringOptions = {},
): Array<RawResult & AdapterResult & { rank: number }> {
  const withScores = rawResults.map((r) => {
    const { score, points } = computeScore(adapter, r.rawValue, options);
    return { ...r, score, points };
  });

  // Sort: authoritative winner first; then by score descending.
  withScores.sort((a, b) => {
    if (a.authoritativeWinner && !b.authoritativeWinner) return -1;
    if (!a.authoritativeWinner && b.authoritativeWinner) return 1;
    return b.score - a.score;
  });

  return withScores.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Return a record of playerId → canonical score, normalised for ranking.
 * Useful for AI pre-simulation: generate a raw score for each AI player and
 * pass through this function to get comparable values.
 */
export function normalizeForRanking(
  rawResults: RawResult[],
  meta: { adapter: string; options?: ScoringOptions },
): Record<string, number> {
  const ranked = computeScores(meta.adapter, rawResults, meta.options);
  const out: Record<string, number> = {};
  for (const r of ranked) {
    out[r.playerId] = r.score;
  }
  return out;
}
