/**
 * Pure helper functions for the "Closest Without Going Over" (CWGO) minigame.
 * All functions are deterministic given a seeded RNG.
 */
import { mulberry32 } from '../../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CwgoGuessEntry {
  playerId: string;
  guess: number;
}

export interface CwgoResult {
  playerId: string;
  guess: number;
  /** Difference from the answer (answer - guess). Negative means went over. */
  diff: number;
  /** Whether the guess went over the answer. */
  wentOver: boolean;
  isWinner: boolean;
}

// ─── AI Guess Generator ───────────────────────────────────────────────────────

/**
 * Generate a deterministic AI guess for a CWGO round.
 *
 * Strategy:
 *  - aiSkill ∈ [0, 1]. Higher skill → guess closer to answer (from below).
 *  - Guess is always ≤ answer to model smart play; with low skill the AI may
 *    overshoot and go over.
 *  - Uses mulberry32 seeded RNG so results are reproducible.
 *
 * @param answer  The true answer for the question.
 * @param aiSkill Skill level in [0, 1]. Values outside this range are clamped automatically. Default 0.5.
 * @param seed    Seed for the RNG.
 */
export function generateAIGuess(answer: number, aiSkill: number, seed: number): number {
  const rng = mulberry32((seed ^ 0xdeadbeef) >>> 0);

  // Clamp skill to [0, 1]
  const skill = Math.max(0, Math.min(1, aiSkill));

  // Range of the answer to determine spread
  // Use a fraction of the answer as spread (at least 1)
  const spread = Math.max(1, Math.round(answer * 0.4));

  // Random offset in [-spread, spread], biased toward positive (under answer) by skill
  const rawOffset = (rng() * 2 - 1) * spread;

  // At high skill: bias negative (guess under), at low skill: allow going over
  const biasedOffset = rawOffset - skill * spread * 0.5;

  const rawGuess = Math.round(answer + biasedOffset);

  // Return at minimum 0 (no negative guesses)
  return Math.max(0, rawGuess);
}

// ─── Winner Computation ───────────────────────────────────────────────────────

/**
 * Given a set of guesses and the true answer, determine which player wins.
 *
 * Rules:
 *  1. Any guess that exceeds the answer ("goes over") is disqualified.
 *  2. Among non-disqualified guesses, the closest (highest without going over) wins.
 *  3. Ties are broken by the order of the guesses array (first entry wins).
 *  4. If ALL guesses went over, the lowest-over guess wins (safeguard).
 *
 * @returns The winning playerId, or null if entries array is empty.
 */
export function computeWinnerClosestWithoutGoingOver(
  guesses: CwgoGuessEntry[],
  answer: number,
): string | null {
  if (guesses.length === 0) return null;

  const valid = guesses.filter((g) => g.guess <= answer);
  const pool = valid.length > 0 ? valid : guesses;

  let best = pool[0];
  for (const entry of pool) {
    if (valid.length > 0) {
      // Closest without going over → highest valid guess wins
      if (entry.guess > best.guess) best = entry;
    } else {
      // All went over → least over (smallest guess) wins
      if (entry.guess < best.guess) best = entry;
    }
  }

  return best.playerId;
}

// ─── Mass Elimination ─────────────────────────────────────────────────────────

/**
 * For a mass-input round, compute which players are eliminated.
 *
 * Elimination rule:
 *  - Players whose guess goes over are eliminated.
 *  - If no one goes over, the player(s) furthest from the answer (lowest guesses) are
 *    eliminated (bottom half, rounded down, minimum 1 eliminated when >2 alive).
 *  - If ALL go over, only the worst (furthest over) are eliminated (all except the
 *    least-over player(s)).
 *
 * @param guesses  Array of guesses from all alive players.
 * @param answer   The true answer.
 * @param aliveIds The IDs of currently-alive players (for ordering).
 * @returns An object with `eliminated` and `surviving` player ID arrays.
 */
export function computeMassElimination(
  guesses: CwgoGuessEntry[],
  answer: number,
  aliveIds: string[],
): { eliminated: string[]; surviving: string[] } {
  if (guesses.length === 0) return { eliminated: [], surviving: [] };

  const overIds = guesses.filter((g) => g.guess > answer).map((g) => g.playerId);

  if (overIds.length > 0 && overIds.length < guesses.length) {
    // Some went over → eliminate those who went over
    const surviving = aliveIds.filter((id) => !overIds.includes(id));
    const eliminated = aliveIds.filter((id) => overIds.includes(id));
    return { eliminated, surviving };
  }

  if (overIds.length === guesses.length) {
    // All went over → eliminate all except the least-over (closest to answer from above)
    const sorted = [...guesses].sort((a, b) => a.guess - b.guess);
    const winnerIdWhenAllOver = sorted[0].playerId;
    const eliminated = aliveIds.filter((id) => id !== winnerIdWhenAllOver);
    const surviving = aliveIds.filter((id) => id === winnerIdWhenAllOver);
    return { eliminated, surviving };
  }

  // No one went over → eliminate bottom half (furthest = lowest guesses)
  const validGuesses = [...guesses].sort((a, b) => a.guess - b.guess); // ascending
  const eliminateCount = Math.max(
    1,
    Math.floor(validGuesses.length / 2),
  );
  const eliminatedIds = validGuesses.slice(0, eliminateCount).map((g) => g.playerId);
  const eliminated = aliveIds.filter((id) => eliminatedIds.includes(id));
  const surviving = aliveIds.filter((id) => !eliminatedIds.includes(id));
  return { eliminated, surviving };
}

// ─── Sorted Results for Reveal ────────────────────────────────────────────────

/**
 * Build a sorted list of results suitable for animating a reveal.
 *
 * Returns results sorted:
 *  1. Winners first (closest without going over), then valid non-winners, then over-guessers.
 *  2. Within each group, sorted by diff ascending (closest to answer first).
 */
export function computeSortedResultsForReveal(
  guesses: CwgoGuessEntry[],
  answer: number,
): CwgoResult[] {
  const winnerId = computeWinnerClosestWithoutGoingOver(guesses, answer);

  const results: CwgoResult[] = guesses.map((g) => {
    const diff = answer - g.guess;
    const wentOver = g.guess > answer;
    return {
      playerId: g.playerId,
      guess: g.guess,
      diff,
      wentOver,
      isWinner: g.playerId === winnerId,
    };
  });

  return results.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    if (a.wentOver !== b.wentOver) return a.wentOver ? 1 : -1;
    return Math.abs(a.diff) - Math.abs(b.diff);
  });
}
