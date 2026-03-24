/**
 * codeBreakerLogic.ts
 *
 * Pure logic utilities for the Vault Cracker (formerly Logic Locks) minigame.
 * Exported separately so they can be tested independently of the React component.
 */

import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CODE_LENGTH = 4;
export const DEFAULT_TIME_LIMIT_MS = 60_000;

/**
 * Minimum score for a player who solved the code (ensures all solvers beat all
 * non-solvers regardless of how late they solved).
 */
export const SOLVED_SCORE_FLOOR = 30;
/**
 * Maximum additional score on top of SOLVED_SCORE_FLOOR (awarded for time remaining).
 * Total solved range: SOLVED_SCORE_FLOOR .. SOLVED_SCORE_FLOOR + SOLVED_SCORE_RANGE
 */
export const SOLVED_SCORE_RANGE = 70; // → max 100
/**
 * Score per correct-digit-in-exact-position for unsolved players.
 * All unsolved scores are < SOLVED_SCORE_FLOOR.
 */
export const UNSOLVED_SCORE_PER_BULL = 4; // max = 3 * 4 = 12  (4 bulls = solved)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuessResult {
  digits: number[];
  /** Correct digit in correct position. */
  bulls: number;
  /** Correct digit in wrong position. */
  cows: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic per-player RNG derived from master seed + player ID. */
function playerRng(masterSeed: number, playerId: string): () => number {
  // FNV-1a hash of playerId, XOR'd with the master seed
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return mulberry32((masterSeed ^ hash) >>> 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate the secret code for a game session.
 * Uses a seeded Fisher-Yates shuffle to pick 4 unique digits from 0–9.
 */
export function generateSecretCode(seed: number): number[] {
  const rng = mulberry32(seed >>> 0);
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, CODE_LENGTH);
}

/**
 * Evaluate a player's guess against the secret code.
 * Returns bulls (right digit, right position) and cows (right digit, wrong position).
 *
 * Note: Cows are computed using digit counts (Mastermind-style) so that guesses
 * with duplicate digits do not over-count matches against the unique-digit secret.
 */
export function evaluateGuess(secret: number[], guess: number[]): GuessResult {
  let bulls = 0;
  let cows = 0;

  // First pass: count bulls.
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      bulls++;
    }
  }

  // Second pass: count non-bull digits for cows using frequency counts so
  // duplicate digits in the guess don't inflate cow counts.
  const secretCounts = new Array(10).fill(0);
  const guessCounts = new Array(10).fill(0);

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] !== secret[i]) {
      secretCounts[secret[i]]++;
      guessCounts[guess[i]]++;
    }
  }

  for (let d = 0; d < 10; d++) {
    cows += Math.min(secretCounts[d], guessCounts[d]);
  }

  return { digits: guess, bulls, cows };
}

/**
 * Compute the score for a player who successfully cracked the code.
 *
 * Score = SOLVED_SCORE_FLOOR + round(SOLVED_SCORE_RANGE * timeRemainingMs / timeLimitMs)
 *
 * Range: SOLVED_SCORE_FLOOR (solved at last moment) … 100 (solved instantly)
 */
export function computeSolvedScore(
  timeRemainingMs: number,
  timeLimitMs: number,
): number {
  const fraction = Math.max(0, Math.min(1, timeRemainingMs / timeLimitMs));
  return SOLVED_SCORE_FLOOR + Math.round(SOLVED_SCORE_RANGE * fraction);
}

/**
 * Compute the score for a player who did NOT crack the code.
 *
 * Score = bestBulls * UNSOLVED_SCORE_PER_BULL
 *
 * Range: 0 … (CODE_LENGTH - 1) * UNSOLVED_SCORE_PER_BULL = 12
 * Always < SOLVED_SCORE_FLOOR (30), so all solvers outrank all non-solvers.
 */
export function computeUnsolvedScore(bestBulls: number): number {
  // bestBulls can be 0–3 (4 bulls means solved)
  return Math.min(CODE_LENGTH - 1, bestBulls) * UNSOLVED_SCORE_PER_BULL;
}

/**
 * Deterministically compute the competition score for a single AI participant.
 *
 * ~65% of AI players solve the code; the rest make partial progress.
 * All computations are derived from (masterSeed, playerId) so they are
 * stable across re-renders and testable.
 */
export function computeAiScore(
  masterSeed: number,
  playerId: string,
  timeLimitMs: number,
): number {
  const rng = playerRng(masterSeed, playerId);

  const solves = rng() < 0.65;
  if (solves) {
    // Solved at a random fraction of the elapsed time [15% … 90%]
    const fractionElapsed = 0.15 + rng() * 0.75;
    const timeRemainingMs = timeLimitMs * (1 - fractionElapsed);
    return computeSolvedScore(timeRemainingMs, timeLimitMs);
  } else {
    // Not solved — random best bulls (0–3)
    const bestBulls = Math.floor(rng() * CODE_LENGTH); // 0–3
    return computeUnsolvedScore(bestBulls);
  }
}

/**
 * Compute scores for every AI participant in the competition.
 * Returns a map of playerId → score.
 */
export function computeAllAiScores(
  masterSeed: number,
  participantIds: string[],
  humanId: string | null,
  timeLimitMs: number,
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of participantIds) {
    if (id !== humanId) {
      scores[id] = computeAiScore(masterSeed, id, timeLimitMs);
    }
  }
  return scores;
}

/**
 * Rank all participant scores (highest first) and return sorted entries.
 * Stable sort: ties keep original participant order.
 */
export function rankScores(
  scores: Record<string, number>,
  participantIds: string[],
): Array<{ id: string; score: number }> {
  return [...participantIds]
    .map((id) => ({ id, score: scores[id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
