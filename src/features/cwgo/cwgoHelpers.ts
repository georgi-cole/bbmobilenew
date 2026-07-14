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
 *  - aiSkill ∈ [0, 1] (values outside this range are clamped). Higher skill →
 *    a tighter spread aimed just under the answer (a strong "closest without
 *    going over" competitor). Lower skill → a wide spread aimed well under the
 *    answer, so the guess is often far off or goes over.
 *  - Going over is always possible regardless of skill due to the random
 *    component.
 *  - Skill is derived per-round from the question difficulty (see
 *    {@link aiSkillRangeForDifficulty}); easy questions yield weak AI so a
 *    human who knows the answer wins ~95% of the time.
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

  // High skill → tight spread; low skill → wide, sloppy spread.
  const spread = Math.max(1, answer * (0.02 + 0.45 * (1 - skill)));

  // Aim under the answer. A skilled AI sits just below it; a weak AI aims much
  // lower (and, with the wide spread, frequently overshoots or lands far off).
  const margin = answer * (0.02 + 0.2 * (1 - skill));
  const target = answer - margin;

  const rawGuess = Math.round(target + (rng() * 2 - 1) * spread);

  // Return at minimum 0 (no negative guesses)
  return Math.max(0, rawGuess);
}

// ─── AI Skill Calibration ─────────────────────────────────────────────────────

/**
 * Map a question's 1–5 difficulty rating to an AI skill band (min/max in [0, 1]).
 *
 * Lower-difficulty ("easy") questions yield a weaker AI band so a human who
 * knows the answer wins the round ~95% of the time; higher-difficulty
 * ("hard") questions yield a stronger band so the AI is genuinely competitive.
 * The per-player skill is later sampled uniformly from the returned band.
 *
 * Buckets: difficulty 1 → easy, 2–3 → medium, 4–5 → hard.
 *
 * @param difficulty Question difficulty (1–5). Values outside the range are clamped.
 */
export function aiSkillRangeForDifficulty(difficulty: number): { min: number; max: number } {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  switch (d) {
    case 1:
      // Easy: AI plays loosely so a correct human almost always wins.
      return { min: 0, max: 0.15 };
    case 2:
      return { min: 0.1, max: 0.4 };
    case 3:
      return { min: 0.25, max: 0.6 };
    case 4:
      return { min: 0.45, max: 0.85 };
    default:
      // Hard: AI is sharp and competitive.
      return { min: 0.6, max: 1 };
  }
}

/** Chance that an AI knows the exact answer before estimation noise is applied. */
export function aiExactAnswerProbability(difficulty: number): number {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return [0.999, 0.9, 0.5, 0.28, 0.12][d - 1];
}

/**
 * Map a question's 1–5 difficulty rating to a player-facing label.
 * Buckets match {@link aiSkillRangeForDifficulty}: 1 → Easy, 2–3 → Medium, 4–5 → Hard.
 */
export function difficultyLabel(difficulty: number): 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard' {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  return ['Very Easy', 'Easy', 'Medium', 'Hard', 'Very Hard'][d - 1] as 'Very Easy' | 'Easy' | 'Medium' | 'Hard' | 'Very Hard';
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
