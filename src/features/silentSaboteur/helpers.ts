/**
 * Silent Saboteur — pure deterministic helpers.
 *
 * All functions are free of side effects and safe to call from tests,
 * reducers, and components alike.
 */

import { mulberry32, seededPick } from '../../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EliminationReason = 'saboteur_caught' | 'victim_eliminated';

export interface RoundOutcome {
  eliminatedId: string;
  reason: EliminationReason;
  /** True when final-3 1-1-1 Victim Override Rule was applied. */
  victimOverride: boolean;
}

export interface Final2Outcome {
  winnerId: string;
  eliminatedId: string;
  reason: 'jury_correct' | 'jury_incorrect' | 'jury_tie' | 'no_jury_fallback';
}

// ─── Saboteur selection ───────────────────────────────────────────────────────

/**
 * Deterministically pick the saboteur for this round.
 * Uses a per-round sub-seed so different rounds produce different results
 * without consuming the primary RNG stream unpredictably.
 */
export function pickSaboteur(seed: number, round: number, activeIds: string[]): string {
  const roundSeed = ((seed ^ (round * 0x9e3779b9)) >>> 0);
  const rng = mulberry32(roundSeed);
  return seededPick(rng, activeIds);
}

// ─── Victim selection ─────────────────────────────────────────────────────────

/**
 * Deterministically pick a victim for the AI saboteur.
 * Excludes the saboteur from valid candidates.
 * Never returns saboteurId.
 */
export function pickVictimForAi(
  seed: number,
  round: number,
  saboteurId: string,
  activeIds: string[],
): string {
  const candidates = activeIds.filter((id) => id !== saboteurId);
  if (candidates.length === 0) {
    // Should never happen with ≥2 players but guard anyway.
    return activeIds[0] === saboteurId ? activeIds[1] ?? activeIds[0] : activeIds[0];
  }
  const victimSeed = ((seed ^ (round * 0x6b43a9c5) ^ 0xdeadbeef) >>> 0);
  const rng = mulberry32(victimSeed);
  return seededPick(rng, candidates);
}

// ─── AI voting ────────────────────────────────────────────────────────────────

/**
 * Deterministically pick who an AI voter accuses this round.
 * Excludes the voter from valid targets (no self-vote).
 *
 * The per-voter sub-seed uses a FNV-1a hash of the voter's ID so that each
 * AI player's suspicion pattern is stable across re-renders.
 */
export function pickVoteForAi(
  seed: number,
  round: number,
  voterId: string,
  activeIds: string[],
): string {
  const candidates = activeIds.filter((id) => id !== voterId);
  if (candidates.length === 0) return activeIds[0];
  const idHash = fnv1a32(voterId);
  const voteSeed = ((seed ^ (round * 0x3c6ef35f) ^ idHash) >>> 0);
  const rng = mulberry32(voteSeed);
  return seededPick(rng, candidates);
}

/**
 * Build all AI votes for a round.  Human vote is excluded (handled via UI).
 */
export function buildAiVotes(
  seed: number,
  round: number,
  aiIds: string[],
  activeIds: string[],
): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const id of aiIds) {
    votes[id] = pickVoteForAi(seed, round, id, activeIds);
  }
  return votes;
}

// ─── Round resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a standard round (4+ players).
 *
 * Strict-majority rule:
 *   saboteurVotes > totalVotes / 2  →  saboteur eliminated
 *   otherwise                       →  victim eliminated
 */
export function resolveStandardRound(
  votes: Record<string, string>,
  saboteurId: string,
  victimId: string,
): RoundOutcome {
  const allVotes = Object.values(votes);
  const totalVotes = allVotes.length;
  const saboteurVotes = allVotes.filter((v) => v === saboteurId).length;
  const majority = Math.floor(totalVotes / 2) + 1; // strict majority

  if (saboteurVotes >= majority) {
    return { eliminatedId: saboteurId, reason: 'saboteur_caught', victimOverride: false };
  }
  return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: false };
}

/**
 * Resolve the Final-3 round (exactly 3 active players).
 *
 * If 2 votes target the same player → resolve as standard round.
 * If 1-1-1 split → Victim Override Rule:
 *   only the victim's vote counts.
 *   victim voted for saboteur → saboteur eliminated.
 *   otherwise                 → victim eliminated.
 */
export function resolveFinal3Round(
  votes: Record<string, string>,
  saboteurId: string,
  victimId: string,
): RoundOutcome {
  const allVotes = Object.values(votes);
  const totalVotes = allVotes.length;
  const saboteurVotes = allVotes.filter((v) => v === saboteurId).length;
  const majority = Math.floor(totalVotes / 2) + 1;

  // 2+ votes for the saboteur → normal catch
  if (saboteurVotes >= majority) {
    return { eliminatedId: saboteurId, reason: 'saboteur_caught', victimOverride: false };
  }

  // Count votes per target
  const voteCounts: Record<string, number> = {};
  for (const v of allVotes) {
    voteCounts[v] = (voteCounts[v] ?? 0) + 1;
  }
  const maxVotes = Math.max(...Object.values(voteCounts));

  if (maxVotes >= majority) {
    // Someone got a majority (just not the saboteur) → victim eliminated
    return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: false };
  }

  // True 1-1-1 split → Victim Override Rule
  const victimVote = votes[victimId];
  if (victimVote === saboteurId) {
    return { eliminatedId: saboteurId, reason: 'saboteur_caught', victimOverride: true };
  }
  return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: true };
}

/**
 * Unified round resolution dispatcher.
 * Automatically selects Final-3 logic when exactly 3 active players remain.
 */
export function resolveRound(
  votes: Record<string, string>,
  saboteurId: string,
  victimId: string,
  activeIds: string[],
): RoundOutcome {
  if (activeIds.length === 3) {
    return resolveFinal3Round(votes, saboteurId, victimId);
  }
  return resolveStandardRound(votes, saboteurId, victimId);
}

// ─── Final-2 jury resolution ──────────────────────────────────────────────────

/**
 * Resolve the Final-2 Jury Deduction Finale.
 *
 * Jury votes for who they think planted the bomb.
 * Strict majority correct → saboteur eliminated, victim wins.
 * Strict majority incorrect → victim eliminated, saboteur wins.
 * Tie → tieBreakVote (victim's vote) decides.
 *   tieBreakVote === saboteurId → victim wins.
 *   otherwise                  → saboteur wins.
 */
export function resolveFinal2(
  juryVotes: Record<string, string>,
  saboteurId: string,
  victimId: string,
  tieBreakVote?: string | null,
): Final2Outcome {
  const allVotes = Object.values(juryVotes);
  const totalVotes = allVotes.length;

  if (totalVotes === 0) {
    // No jury: caller must supply a seed-based fallback.
    return {
      winnerId: victimId,
      eliminatedId: saboteurId,
      reason: 'no_jury_fallback',
    };
  }

  const saboteurVotes = allVotes.filter((v) => v === saboteurId).length;
  const majority = Math.floor(totalVotes / 2) + 1;

  if (saboteurVotes >= majority) {
    // Jury correctly identified saboteur → victim wins
    return { winnerId: victimId, eliminatedId: saboteurId, reason: 'jury_correct' };
  }
  if (totalVotes - saboteurVotes >= majority) {
    // Jury incorrectly identified (majority voted for victim) → saboteur wins
    return { winnerId: saboteurId, eliminatedId: victimId, reason: 'jury_incorrect' };
  }

  // Tie: victim's vote decides
  if (tieBreakVote === saboteurId) {
    return { winnerId: victimId, eliminatedId: saboteurId, reason: 'jury_tie' };
  }
  return { winnerId: saboteurId, eliminatedId: victimId, reason: 'jury_tie' };
}

/**
 * Deterministic no-jury fallback for Final-2 (started with only 2 players).
 * Uses the seed to determine a winner without any votes.
 * Returns the winner ID.
 */
export function noJuryFallbackWinner(
  seed: number,
  saboteurId: string,
  victimId: string,
): string {
  const rng = mulberry32((seed ^ 0xfeedface) >>> 0);
  return seededPick(rng, [saboteurId, victimId]);
}

/**
 * Build deterministic jury votes for AI jurors.
 * Each juror independently decides whether to vote for saboteur or victim.
 * Accuracy is seeded per-juror so it is stable.
 */
export function buildAiJuryVotes(
  seed: number,
  jurorIds: string[],
  saboteurId: string,
  victimId: string,
): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const jurorId of jurorIds) {
    const idHash = fnv1a32(jurorId);
    const jurySeed = ((seed ^ idHash ^ 0xc001cafe) >>> 0);
    const rng = mulberry32(jurySeed);
    // ~50% base accuracy — jurors make an honest guess
    const accuseSaboteur = rng() < 0.5;
    votes[jurorId] = accuseSaboteur ? saboteurId : victimId;
  }
  return votes;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — stable string → uint32. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

/**
 * Compute deterministic AI tiebreak vote for the victim in Final-2.
 * Victim selects deterministically from [saboteurId, victimId].
 * (In practice the victim selects the OTHER finalist to accuse.)
 */
export function pickVictimTieBreakVote(
  seed: number,
  victimId: string,
  saboteurId: string,
  otherFinalistId: string,
): string {
  const idHash = fnv1a32(victimId);
  const tbSeed = ((seed ^ idHash ^ 0xbabe1234) >>> 0);
  const rng = mulberry32(tbSeed);
  return seededPick(rng, [saboteurId, otherFinalistId]);
}
