/**
 * codeBreakerLogic.ts
 *
 * Pure logic utilities for the Vault Cracker (formerly Logic Locks) minigame.
 * Exported separately so they can be tested independently of the React component.
 *
 * Scoring design (hard-puzzle model):
 *   - Fewer attempts always rank higher.
 *   - Time is a smaller secondary modifier that cannot overcome an attempt tier.
 *   - AI attempt counts use an explicitly weighted human-like distribution.
 *
 * Attempt bands:
 *   Mythic   1–2   (lucky/outlier – confidence-discounted)
 *   Elite    3–4   (peak skill zone)
 *   Expert   5–6   (strong performance)
 *   Strong   7–8   (typical good solve)
 *   Solved   9–10  (lower-end success)
 *   Struggled 11+  (completed, low efficiency)
 */

import { mulberry32 } from '../../store/rng';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CODE_LENGTH = 4;
export const DEFAULT_ELAPSED_SCORE_CAP_MS = 180_000;

/**
 * Minimum score for any completed solve (floor applied after all modifiers).
 */
export const SOLVED_SCORE_FLOOR = 5;

/**
 * Maximum time bonus added on top of the attempt-based score.
 * Time contributes 0–TIME_BONUS_MAX points as a tiebreaker within each attempt tier.
 */
export const TIME_BONUS_MAX = 3;

// ─── Attempt-band scoring tables ──────────────────────────────────────────────

/**
 * Raw base scores by attempt count. Adjacent tiers are separated by more than
 * TIME_BONUS_MAX so elapsed time only breaks ties within an attempt tier.
 */
const ATTEMPT_BASE_SCORE_TABLE: Record<number, number> = {
  1: 97,
  2: 93,
  3: 89,
  4: 85,
  5: 81,
  6: 77,
  7: 73,
  8: 69,
  9: 65,
  10: 61,
};
/** Base score for 11 attempts; declines by ATTEMPT_BASE_SCORE_DECLINE per extra attempt. */
const ATTEMPT_BASE_SCORE_11 = 57;
const ATTEMPT_BASE_SCORE_DECLINE = 4;
const ATTEMPT_BASE_SCORE_HARD_FLOOR = SOLVED_SCORE_FLOOR;

// ─── Attempt bands ────────────────────────────────────────────────────────────

/**
 * Attempt-based performance band for the leaderboard.
 *
 * Bands reflect the expected difficulty of a hard deduction puzzle where
 * the bulk of successful solvers land around 6–8 attempts.
 */
export type AttemptBand = 'mythic' | 'elite' | 'expert' | 'strong' | 'solved' | 'struggled';

/** Human-readable label for each attempt band. */
export const ATTEMPT_BAND_LABELS: Record<AttemptBand, string> = {
  mythic: 'Mythic',
  elite: 'Elite',
  expert: 'Expert',
  strong: 'Strong',
  solved: 'Solved',
  struggled: 'Struggled',
};

/**
 * Map an attempt count to its performance band.
 *
 * - 1–2:  Mythic   (very lucky / outlier)
 * - 3–4:  Elite    (exceptional deduction)
 * - 5–6:  Expert   (strong performance)
 * - 7–8:  Strong   (typical good solve)
 * - 9–10: Solved   (lower-end success)
 * - 11+:  Struggled
 */
export function getAttemptBand(attempts: number): AttemptBand {
  if (attempts <= 2) return 'mythic';
  if (attempts <= 4) return 'elite';
  if (attempts <= 6) return 'expert';
  if (attempts <= 8) return 'strong';
  if (attempts <= 10) return 'solved';
  return 'struggled';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuessResult {
  digits: number[];
  /** Correct digit in correct position. */
  bulls: number;
  /** Correct digit in wrong position. */
  cows: number;
}

export interface AiSolveProfile {
  attempts: number;
  elapsedMs: number;
  score: number;
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

// ─── Internal scoring helpers ─────────────────────────────────────────────────

function attemptBaseScore(attempts: number): number {
  if (attempts <= 10) {
    return ATTEMPT_BASE_SCORE_TABLE[attempts] ?? ATTEMPT_BASE_SCORE_TABLE[10];
  }
  return Math.max(
    ATTEMPT_BASE_SCORE_HARD_FLOOR,
    ATTEMPT_BASE_SCORE_11 - (attempts - 11) * ATTEMPT_BASE_SCORE_DECLINE,
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the score for a player who successfully cracked the code.
 *
 * Formula:
 *   timeBonus    = round(TIME_BONUS_MAX × timeFraction)
 *   score        = max(SOLVED_SCORE_FLOOR, attemptBase + timeBonus)
 *
 * Design:
 *   - Attempts dominate and fewer attempts always score higher.
 *   - Time contributes a 0–TIME_BONUS_MAX bonus as a secondary tiebreaker.
 */
export function computeSolvedScore(
  attempts: number,
  elapsedMs: number,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): number {
  const safeAttempts = Math.max(1, attempts);
  const safeElapsedScoreCapMs = Math.max(1, elapsedScoreCapMs);
  const base = attemptBaseScore(safeAttempts);
  const timeFraction = Math.max(
    0,
    Math.min(1, 1 - Math.max(0, elapsedMs) / safeElapsedScoreCapMs),
  );
  const timeBonus = Math.round(TIME_BONUS_MAX * timeFraction);
  return Math.max(SOLVED_SCORE_FLOOR, base + timeBonus);
}

/**
 * Deterministically compute the competition score for a single AI participant.
 *
 * AI players always eventually solve the code, with attempt efficiency and
 * elapsed-time profiles derived from (masterSeed, playerId).
 *
 * Weighted attempt distribution: 4: 5%; 5–6: 13%; 7–8: 22%; 9: 18%;
 * 10: 18%; 11–15: 20%; 16–20: 4%.
 */
export function computeAiSolveProfile(
  masterSeed: number,
  playerId: string,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): AiSolveProfile {
  const rng = playerRng(masterSeed, playerId);
  const roll = rng();
  let attempts: number;
  if (roll < 0.05) attempts = 4;
  else if (roll < 0.18) attempts = 5 + Math.floor(rng() * 2);
  else if (roll < 0.40) attempts = 7 + Math.floor(rng() * 2);
  else if (roll < 0.58) attempts = 9;
  else if (roll < 0.76) attempts = 10;
  else if (roll < 0.96) attempts = 11 + Math.floor(rng() * 5);
  else attempts = 16 + Math.floor(rng() * 5);
  const elapsedMs = Math.min(
    elapsedScoreCapMs,
    12_000 + attempts * 4_000 + Math.round(rng() * 20_000),
  );
  return {
    attempts,
    elapsedMs,
    score: computeSolvedScore(attempts, elapsedMs, elapsedScoreCapMs),
  };
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
  return computeAiSolveProfile(masterSeed, playerId, elapsedScoreCapMs).score;
}

/**
 * Compute deterministic solve profiles for every AI participant in the competition.
 * Returns a map of playerId → attempts, elapsedMs, and score.
 */
export function computeAllAiSolveProfiles(
  masterSeed: number,
  participantIds: string[],
  humanId: string | null,
  elapsedScoreCapMs = DEFAULT_ELAPSED_SCORE_CAP_MS,
): Record<string, AiSolveProfile> {
  const profiles: Record<string, AiSolveProfile> = {};
  for (const id of participantIds) {
    if (id !== humanId) {
      profiles[id] = computeAiSolveProfile(masterSeed, id, elapsedScoreCapMs);
    }
  }
  return profiles;
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
  const profiles = computeAllAiSolveProfiles(masterSeed, participantIds, humanId, elapsedScoreCapMs);
  for (const [id, profile] of Object.entries(profiles)) {
    scores[id] = profile.score;
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
