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
  /** Time from the fully displayed question to submission. */
  responseTimeMs?: number;
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

/**
 * Produce a deterministic but human-like AI response time. Each player has a
 * stable speed tendency, while question difficulty and round-level jitter keep
 * their timing from looking robotic.
 */
export function generateAIResponseTimeMs(
  difficulty: number,
  seed: number,
  playerId: string,
  round: number,
): number {
  const d = Math.max(1, Math.min(5, Math.round(difficulty)));
  let idHash = 2166136261;
  for (let index = 0; index < playerId.length; index += 1) {
    idHash ^= playerId.charCodeAt(index);
    idHash = Math.imul(idHash, 16777619);
  }
  const traitRng = mulberry32((idHash ^ 0x51f15e) >>> 0);
  const roundRng = mulberry32((seed ^ idHash ^ Math.imul(round + 1, 0x6d2b79f5)) >>> 0);
  const speedTrait = 0.78 + traitRng() * 0.48;
  const thinkingMs = (1_700 + d * 720 + roundRng() * (1_900 + d * 520)) * speedTrait;
  return Math.round(Math.max(1_800, Math.min(13_500, thinkingMs)));
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
 *  3. Equal guesses are broken by faster response time.
 *  4. If all guesses went over, the round is void and returns null.
 *
 * @returns The winning playerId, or null if entries array is empty.
 */
export function computeWinnerClosestWithoutGoingOver(
  guesses: CwgoGuessEntry[],
  answer: number,
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0,
): string | null {
  if (guesses.length === 0) return null;

  const valid = guesses.filter((g) => g.guess <= answer);
  // A round where everyone went over is void and must be replayed.
  if (valid.length === 0) return null;

  const bestGuess = Math.max(...valid.map((entry) => entry.guess));
  const tied = valid.filter((entry) => entry.guess === bestGuess);
  return [...tied].sort((a, b) => {
    const timeDiff = (responseTimesMs[a.playerId] ?? Number.MAX_SAFE_INTEGER)
      - (responseTimesMs[b.playerId] ?? Number.MAX_SAFE_INTEGER);
    if (timeDiff !== 0) return timeDiff;
    const seededRank = (id: string) => {
      let hash = tieSeed >>> 0;
      for (let index = 0; index < id.length; index += 1) {
        hash ^= id.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    return seededRank(a.playerId) - seededRank(b.playerId);
  })[0]?.playerId ?? null;
}

// ─── Mass Elimination ─────────────────────────────────────────────────────────

/**
 * For a mass-input round, compute which players are eliminated.
 *
 * Elimination rule:
 *  - Players whose guess goes over are eliminated.
 *  - If no one goes over, the furthest valid guess is eliminated. An exact tie
 *    eliminates only the slower player.
 *  - If all go over, nobody is eliminated and the question is redrawn.
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
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0,
): { eliminated: string[]; surviving: string[]; redraw: boolean } {
  if (guesses.length === 0) return { eliminated: [], surviving: [], redraw: false };

  const overIds = guesses.filter((g) => g.guess > answer).map((g) => g.playerId);

  if (overIds.length > 0 && overIds.length < guesses.length) {
    // Some went over → eliminate those who went over
    const surviving = aliveIds.filter((id) => !overIds.includes(id));
    const eliminated = aliveIds.filter((id) => overIds.includes(id));
    return { eliminated, surviving, redraw: false };
  }

  if (overIds.length === guesses.length) {
    // Everyone missed the core rule, so discard the question without elimination.
    return { eliminated: [], surviving: [...aliveIds], redraw: true };
  }

  // Nobody went over: the furthest valid guess is vulnerable. If several
  // players made that exact guess, only the slowest submission is eliminated.
  const lowestGuess = Math.min(...guesses.map((entry) => entry.guess));
  const tiedFurthest = guesses.filter((entry) => entry.guess === lowestGuess);
  const seededRank = (id: string) => {
    let hash = tieSeed >>> 0;
    for (let index = 0; index < id.length; index += 1) {
      hash ^= id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const eliminatedId = [...tiedFurthest].sort((a, b) => {
    const timeDiff = (responseTimesMs[b.playerId] ?? Number.MAX_SAFE_INTEGER)
      - (responseTimesMs[a.playerId] ?? Number.MAX_SAFE_INTEGER);
    if (timeDiff !== 0) return timeDiff;
    return seededRank(a.playerId) - seededRank(b.playerId);
  })[0]?.playerId;
  const eliminated = eliminatedId ? [eliminatedId] : [];
  const surviving = aliveIds.filter((id) => id !== eliminatedId);
  return { eliminated, surviving, redraw: false };
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
  responseTimesMs: Record<string, number> = {},
  tieSeed = 0,
): CwgoResult[] {
  const winnerId = computeWinnerClosestWithoutGoingOver(guesses, answer, responseTimesMs, tieSeed);

  const results: CwgoResult[] = guesses.map((g) => {
    const diff = answer - g.guess;
    const wentOver = g.guess > answer;
    return {
      playerId: g.playerId,
      guess: g.guess,
      diff,
      wentOver,
      isWinner: g.playerId === winnerId,
      responseTimeMs: responseTimesMs[g.playerId],
    };
  });

  return results.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
    if (a.wentOver !== b.wentOver) return a.wentOver ? 1 : -1;
    const distance = Math.abs(a.diff) - Math.abs(b.diff);
    if (distance !== 0) return distance;
    return (a.responseTimeMs ?? Number.MAX_SAFE_INTEGER) - (b.responseTimeMs ?? Number.MAX_SAFE_INTEGER);
  });
}
