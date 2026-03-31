/**
 * timingBarLogic.ts
 *
 * Core game-logic utilities for the Timing Bar round-based elimination minigame.
 * All functions are pure / side-effect-free so they are straightforward to unit-test.
 */

import { mulberry32 } from '../../store/rng';
import type { Player } from '../../types';
import { resolveAvatar } from '../../utils/avatar';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Bar moves from 0 → 100 (%) representing position along the track. */
export const BAR_TRACK_WIDTH = 100;

/** Ideal stop position — center of the bar. */
export const TARGET_POSITION = 50;

/** Penalty in percentage points for each non-locking (soft) attempt. */
export const NON_LOCKING_PENALTY_PP = 6.0;

/** Round 1 starts with this many seconds. */
export const INITIAL_ROUND_SECONDS = 20;

/** Seconds removed from each new round until the minimum is reached. */
export const ROUND_TIME_DECREMENT = 5;

/** Minimum round duration in seconds. */
export const MIN_ROUND_SECONDS = 5;

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * djb2-style string hash — produces a 32-bit unsigned integer from a string.
 * Used to derive a unique per-participant seed component so tied-rank elimination
 * tiebreaks don't collide when participant IDs share a common prefix or first char.
 */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TimingParticipant {
  id: string;
  name: string;
  avatar: string;
  isHuman: boolean;
}

export interface TimingSubmission {
  participantId: string;
  /** Bar position at lock-in (0–100). */
  lockedPosition: number;
  /** Milliseconds remaining on the clock when the player locked in. */
  timeRemainingMs: number;
  /** How many non-locking (soft) attempts were made before the final lock. */
  nonLockingAttempts: number;
  /** Whether the round timed out with no lock-in. */
  timedOut: boolean;
}

export interface TimingRoundEntry {
  participantId: string;
  name: string;
  avatar: string;
  isHuman: boolean;
  /** Final displayed accuracy after penalty (0–100, 1 decimal). */
  finalAccuracy: number;
  /** Raw timing accuracy before penalty. */
  rawAccuracy: number;
  /** Milliseconds remaining when player locked in (0 when timed out). */
  timeRemainingMs: number;
  nonLockingAttempts: number;
  timedOut: boolean;
  /** Rank in this round (1 = best). Players with identical ranks share that rank. */
  rank: number;
  isEliminated: boolean;
}

export interface TimingRoundResult {
  roundNumber: number;
  roundDurationSeconds: number;
  entries: TimingRoundEntry[];
  advancingIds: string[];
  eliminatedIds: string[];
  isFinalRound: boolean;
}

/** Returns round entries sorted by their authoritative rank (best → worst). */
export function getRankedTimingEntries(roundResult: TimingRoundResult | null | undefined): TimingRoundEntry[] {
  if (!roundResult) return [];
  return [...roundResult.entries].sort((a, b) => a.rank - b.rank);
}

/** Returns the authoritative winner for a round based on rank, not array order. */
export function getTimingRoundWinner(roundResult: TimingRoundResult | null | undefined): TimingRoundEntry | null {
  return getRankedTimingEntries(roundResult)[0] ?? null;
}

// ── Round configuration ────────────────────────────────────────────────────────

/**
 * Returns the available seconds for a given round number (1-based).
 * 20s → 15s → 10s → 5s → 5s → …
 */
export function getRoundDurationSeconds(roundNumber: number): number {
  const raw = INITIAL_ROUND_SECONDS - (roundNumber - 1) * ROUND_TIME_DECREMENT;
  return Math.max(MIN_ROUND_SECONDS, raw);
}

/** Returns the bar speed multiplier for a given round (increases after round 3). */
export function getRoundBarSpeed(roundNumber: number): number {
  if (roundNumber <= 2) return 1.0;
  if (roundNumber <= 4) return 1.25;
  return 1.5;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * Computes raw accuracy (0–100) for a given bar position.
 * Accuracy is 100% when position equals TARGET_POSITION (50) and decreases
 * linearly to 0% at the edges (0 or 100).
 *
 * Formula: rawAccuracy = max(0, 100 − |position − 50| × 2)
 */
export function computeRawAccuracy(barPosition: number): number {
  const error = Math.abs(barPosition - TARGET_POSITION);
  return Math.max(0, 100 - error * 2);
}

/**
 * Applies the non-locking attempt penalty to a raw accuracy.
 * Each non-locking attempt deducts NON_LOCKING_PENALTY_PP percentage points.
 * Result is clamped to [0, 100].
 */
export function applyAttemptPenalty(rawAccuracy: number, nonLockingAttempts: number): number {
  const penalty = nonLockingAttempts * NON_LOCKING_PENALTY_PP;
  return Math.max(0, rawAccuracy - penalty);
}

/**
 * Formats an accuracy value as "XX,X%" (comma decimal separator, 1 decimal).
 * Example: 98.4 → "98,4%"
 */
export function formatAccuracy(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`;
}

/**
 * Rounds a value to 1 decimal place (tenths precision).
 * Used to quantize accuracy values so the sort order matches the displayed values,
 * preventing hidden floating-point differences from affecting rankings.
 */
function quantizeToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// ── Elimination ────────────────────────────────────────────────────────────────

/**
 * Returns the number of players to eliminate at end of a round.
 *
 * Rules:
 *  - 5 or more active players → eliminate 2
 *  - 3 or 4 active players    → eliminate 1
 *  - 2 active players         → eliminate 0 (final duel)
 */
export function getEliminationCount(activeCount: number): number {
  if (activeCount >= 5) return 2;
  if (activeCount >= 3) return 1;
  return 0;
}

// ── Ranking ────────────────────────────────────────────────────────────────────

/**
 * Assigns ranks to an array of round entries.
 * Ranking order:
 *  1. Higher finalAccuracy (desc)
 *  2. More timeRemainingMs (desc)
 *  3. Fewer nonLockingAttempts (asc)
 *  4. Shared rank
 *
 * Special case: if exactly 2 players remain and all three criteria are tied,
 * break the tie using a pseudorandom choice based on the provided `roundSeed`.
 *
 * Returns a new array with the `rank` field populated.
 */
export function assignRanks(
  entries: Omit<TimingRoundEntry, 'rank' | 'isEliminated'>[],
  roundSeed: number,
): (Omit<TimingRoundEntry, 'isEliminated'> & { rank: number })[] {
  // Precompute deterministic per-participant tiebreak keys so the comparator
  // remains pure and anti-symmetric while still producing a seeded ordering.
  const tiebreakKey = new Map<string, number>();
  for (const entry of entries) {
    const id = entry.participantId;
    const combinedSeed = (roundSeed ^ hashString(id)) >>> 0;
    const rng = mulberry32(combinedSeed);
    tiebreakKey.set(id, rng());
  }

  const sorted = [...entries].sort((a, b) => {
    if (b.finalAccuracy !== a.finalAccuracy) return b.finalAccuracy - a.finalAccuracy;
    if (b.timeRemainingMs !== a.timeRemainingMs) return b.timeRemainingMs - a.timeRemainingMs;
    if (a.nonLockingAttempts !== b.nonLockingAttempts) return a.nonLockingAttempts - b.nonLockingAttempts;
    // Final 2 deterministic seed-based tiebreak: compare per-participant keys
    if (entries.length === 2) {
      const keyA = tiebreakKey.get(a.participantId) ?? 0;
      const keyB = tiebreakKey.get(b.participantId) ?? 0;
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
    }
    return 0;
  });

  let rank = 1;
  const ranked = sorted.map((entry, idx) => {
    if (idx > 0) {
      const prev = sorted[idx - 1];
      const isTied =
        entry.finalAccuracy === prev.finalAccuracy &&
        entry.timeRemainingMs === prev.timeRemainingMs &&
        entry.nonLockingAttempts === prev.nonLockingAttempts;
      if (!isTied) rank = idx + 1;
    }
    return { ...entry, rank };
  });

  return ranked;
}

// ── Round outcome builder ──────────────────────────────────────────────────────

/**
 * Given all submissions for a round, build the ranked round result.
 */
export function buildTimingRoundResult(params: {
  roundNumber: number;
  activeParticipants: TimingParticipant[];
  submissions: TimingSubmission[];
  allPlayers: Player[];
  seed: number;
}): TimingRoundResult {
  const { roundNumber, activeParticipants, submissions, seed } = params;

  const roundDurationSeconds = getRoundDurationSeconds(roundNumber);
  const eliminationCount = getEliminationCount(activeParticipants.length);
  const isFinalRound = activeParticipants.length <= 2;

  const roundSeed = deriveRoundSeed(seed, roundNumber);

  const baseEntries = activeParticipants.map((participant): Omit<TimingRoundEntry, 'rank' | 'isEliminated'> => {
    const submission = submissions.find((s) => s.participantId === participant.id);

    if (!submission || submission.timedOut) {
      return {
        participantId: participant.id,
        name: participant.name,
        avatar: participant.avatar,
        isHuman: participant.isHuman,
        finalAccuracy: 0,
        rawAccuracy: 0,
        timeRemainingMs: 0,
        nonLockingAttempts: submission?.nonLockingAttempts ?? 0,
        timedOut: true,
      };
    }

    const rawAccuracy = quantizeToOneDecimal(computeRawAccuracy(submission.lockedPosition));
    const finalAccuracy = quantizeToOneDecimal(applyAttemptPenalty(rawAccuracy, submission.nonLockingAttempts));

    return {
      participantId: participant.id,
      name: participant.name,
      avatar: participant.avatar,
      isHuman: participant.isHuman,
      finalAccuracy,
      rawAccuracy,
      timeRemainingMs: submission.timeRemainingMs,
      nonLockingAttempts: submission.nonLockingAttempts,
      timedOut: false,
    };
  });

  const ranked = assignRanks(baseEntries, roundSeed);

  // Determine eliminations: take the bottom `eliminationCount` by rank.
  // Never go below 2 remaining.
  const maxEliminations = Math.max(0, activeParticipants.length - 2);
  const actualEliminations = Math.min(eliminationCount, maxEliminations);

  // Precompute per-participant shuffle keys for a deterministic, transitive tie-break
  // at the elimination boundary. Using a plain hash XOR (not RNG-per-a) ensures the
  // comparator is anti-symmetric and produces the same order regardless of engine.
  const eliminationKey = new Map<string, number>();
  for (const entry of ranked) {
    eliminationKey.set(
      entry.participantId,
      (hashString(entry.participantId) ^ roundSeed) >>> 0,
    );
  }
  const worstFirst = [...ranked].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const keyA = eliminationKey.get(a.participantId) ?? 0;
    const keyB = eliminationKey.get(b.participantId) ?? 0;
    return keyA - keyB;
  });
  const eliminatedIds = worstFirst.slice(0, actualEliminations).map((e) => e.participantId);

  const entries: TimingRoundEntry[] = ranked.map((entry) => ({
    ...entry,
    isEliminated: eliminatedIds.includes(entry.participantId),
  }));

  const advancingIds = activeParticipants
    .map((p) => p.id)
    .filter((id) => !eliminatedIds.includes(id));

  return {
    roundNumber,
    roundDurationSeconds,
    entries,
    advancingIds,
    eliminatedIds,
    isFinalRound,
  };
}

/** Derives a deterministic per-round seed. */
export function deriveRoundSeed(gameSeed: number, roundNumber: number): number {
  return (gameSeed ^ (roundNumber * 0x9e3779b9)) >>> 0;
}

/**
 * Builds TimingParticipant objects from raw Player records.
 * Marks the human player based on humanId.
 */
export function buildParticipants(players: Player[], humanId: string | undefined): TimingParticipant[] {
  return players.map((p) => ({
    id: p.id,
    name: p.isUser ? 'You' : p.name,
    avatar: resolveAvatar(p),
    isHuman: p.isUser || p.id === humanId,
  }));
}

/**
 * Simulate all remaining rounds for spectator/skip mode using AI-generated submissions.
 * Returns the sequence of round results through to the final.
 */
export function simulateRemainingRounds(params: {
  activeParticipantIds: string[];
  allParticipants: TimingParticipant[];
  aiSubmissionFn: (participantId: string, roundNumber: number, seed: number) => TimingSubmission;
  startingRoundNumber: number;
  seed: number;
}): TimingRoundResult[] {
  const { aiSubmissionFn, allParticipants, seed } = params;
  let activeIds = [...params.activeParticipantIds];
  let roundNumber = params.startingRoundNumber;
  const results: TimingRoundResult[] = [];

  while (activeIds.length >= 2) {
    const activeParticipants = allParticipants.filter((p) => activeIds.includes(p.id));
    const roundSeed = deriveRoundSeed(seed, roundNumber);
    const submissions = activeIds.map((id) => aiSubmissionFn(id, roundNumber, roundSeed));

    const result = buildTimingRoundResult({
      roundNumber,
      activeParticipants,
      submissions,
      allPlayers: [],
      seed,
    });

    results.push(result);

    if (result.isFinalRound || result.eliminatedIds.length === 0) break;

    activeIds = result.advancingIds;
    roundNumber += 1;
  }

  return results;
}
