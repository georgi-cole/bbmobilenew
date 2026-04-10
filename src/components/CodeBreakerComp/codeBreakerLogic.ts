/**
 * codeBreakerLogic.ts
 *
 * Pure logic utilities for the Vault Cracker (formerly Logic Locks) minigame.
 * Exported separately so they can be tested independently of the React component.
 */

import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CODE_LENGTH = 4;
export const DEFAULT_ELAPSED_SCORE_CAP_MS = 180_000;

/**
 * Minimum score for a completed solve.
 */
export const SOLVED_SCORE_FLOOR = 30;
/**
 * Maximum additional score on top of SOLVED_SCORE_FLOOR.
 * Total solved range: SOLVED_SCORE_FLOOR .. SOLVED_SCORE_FLOOR + SOLVED_SCORE_RANGE
 */
export const SOLVED_SCORE_RANGE = 70; // → max 100
export const SOLVED_ATTEMPT_WEIGHT = 0.65;
export const SOLVED_TIME_WEIGHT = 0.35;

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

  // Second pass: count non-bull digits for cows using frequency counts.
  const secretCounts = new Array(10).fill(0);
  const guessCounts = new Array(10).fill(0);

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] !== secret[i]) {
      const secretDigit = secret[i];
      const guessDigit = guess[i];
      if (secretDigit >= 0 && secretDigit <= 9) {
        secretCounts[secretDigit]++;
      }
      if (guessDigit >= 0 && guessDigit <= 9) {
        guessCounts[guessDigit]++;
      }
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
 * Score = SOLVED_SCORE_FLOOR + round(SOLVED_SCORE_RANGE * weightedPerformance)
 *
 * weightedPerformance blends:
 *   - Attempts: 1 / attempts
 *   - Time:     remaining fraction within DEFAULT_ELAPSED_SCORE_CAP_MS
 *
 * Fewer attempts carry the most weight, while faster solves add a smaller but
 * meaningful bonus.
 */
export function computeSolvedScore(
  attempts: number,
  elapsedMs: number,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): number {
  const safeAttempts = Math.max(1, attempts);
  const safeElapsedScoreCapMs = Math.max(1, elapsedScoreCapMs);
  const attemptsFraction = 1 / safeAttempts;
  const timeFraction = Math.max(
    0,
    Math.min(1, 1 - Math.max(0, elapsedMs) / safeElapsedScoreCapMs),
  );
  const weightedPerformance =
    (attemptsFraction * SOLVED_ATTEMPT_WEIGHT) + (timeFraction * SOLVED_TIME_WEIGHT);

  return SOLVED_SCORE_FLOOR + Math.round(SOLVED_SCORE_RANGE * weightedPerformance);
}

/**
 * Deterministically compute the competition score for a single AI participant.
 *
 * AI players always eventually solve the code, with attempt efficiency and
 * elapsed-time profiles derived from (masterSeed, playerId).
 */
export function computeAiScore(
  masterSeed: number,
  playerId: string,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): number {
  const rng = playerRng(masterSeed, playerId);
  const attempts = 1 + Math.floor(rng() * 8);
  const elapsedMs = Math.min(
    elapsedScoreCapMs,
    15_000 + Math.round(rng() * elapsedScoreCapMs),
  );
  return computeSolvedScore(attempts, elapsedMs, elapsedScoreCapMs);
}

/**
 * Compute scores for every AI participant in the competition.
 * Returns a map of playerId → score.
 */
export function computeAllAiScores(
  masterSeed: number,
  participantIds: string[],
  humanId: string | null,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of participantIds) {
    if (id !== humanId) {
      scores[id] = computeAiScore(masterSeed, id, elapsedScoreCapMs);
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
