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
  /** The player who was accused (highest votes, or victim-override target). */
  accusedId: string;
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

// ─── Candidate filtering ──────────────────────────────────────────────────────

/**
 * Return the valid saboteur-candidate IDs for a voter in a normal round.
 *
 * Rule: valid suspects = activePlayers - self - victim
 *
 * This must be used consistently by: the human voting UI, AI vote generation,
 * timeout/fallback vote logic, and round resolution validation.
 *
 * @param activeIds    All currently active player IDs.
 * @param currentPlayerId  The player who is casting the vote.
 * @param victimId     The current round's victim (excluded from accusation).
 */
export function getValidSaboteurCandidates(
  activeIds: string[],
  currentPlayerId: string,
  victimId: string | null,
): string[] {
  return activeIds.filter((id) => id !== currentPlayerId && id !== victimId);
}

// ─── AI voting ────────────────────────────────────────────────────────────────

/**
 * Deterministically pick who an AI voter accuses this round.
 * Excludes the voter (no self-vote) and the victim (victim is not a valid
 * saboteur candidate in normal rounds).
 *
 * The per-voter sub-seed uses a FNV-1a hash of the voter's ID so that each
 * AI player's suspicion pattern is stable across re-renders.
 */
export function pickVoteForAi(
  seed: number,
  round: number,
  voterId: string,
  activeIds: string[],
  victimId?: string | null,
): string {
  const candidates = getValidSaboteurCandidates(activeIds, voterId, victimId ?? null);
  if (candidates.length === 0) {
    // Absolute last resort for degenerate inputs: prefer any non-self target,
    // otherwise return the voter only when no alternative exists.
    const fallback = activeIds.filter((id) => id !== voterId);
    return fallback[0] ?? voterId;
  }
  const idHash = fnv1a32(voterId);
  const voteSeed = ((seed ^ (round * 0x3c6ef35f) ^ idHash) >>> 0);
  const rng = mulberry32(voteSeed);
  return seededPick(rng, candidates);
}

/**
 * Abstention-aware AI vote picker for normal rounds.
 * Returns null when victim exclusion leaves no valid suspects.
 */
export function pickVoteForAiOrAbstain(
  seed: number,
  round: number,
  voterId: string,
  activeIds: string[],
  victimId?: string | null,
): string | null {
  const candidates = getValidSaboteurCandidates(activeIds, voterId, victimId ?? null);
  if (candidates.length === 0) return null;
  return pickVoteForAi(seed, round, voterId, activeIds, victimId ?? null);
}

/**
 * Build all AI votes for a round, excluding the victim from valid targets.
 * Human vote is excluded (handled via UI).
 */
export function buildAiVotes(
  seed: number,
  round: number,
  aiIds: string[],
  activeIds: string[],
  victimId?: string | null,
): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const id of aiIds) {
    const accusedId = pickVoteForAiOrAbstain(seed, round, id, activeIds, victimId ?? null);
    if (accusedId == null) continue;
    votes[id] = accusedId;
  }
  return votes;
}

// ─── Round resolution ─────────────────────────────────────────────────────────

/**
 * Unified deterministic round resolution supporting abstentions.
 *
 * Implements the canonical tie + abstention rules:
 *
 *   Case D: Everyone abstains (no votes submitted)
 *     → eliminate victim immediately.
 *
 *   Case A: Unique highest vote total
 *     → accused = most-voted candidate.
 *     → if accused === saboteur → saboteur eliminated (saboteur_caught).
 *     → otherwise               → victim eliminated  (victim_eliminated).
 *
 *   Case B: Tie + victim voted
 *     → Victim Override Rule: accused = victim's vote.
 *     → resolve as Case A.
 *
 *   Case C: Tie + victim abstained
 *     → eliminate victim immediately.
 *
 * @param votes       Submitted votes only (Record<voterId, accusedId>).
 *                    Absent entries = abstentions — they are NOT counted.
 * @param _allVoterIds All active player IDs (reserved for future diagnostics).
 * @param saboteurId  Current round's saboteur.
 * @param victimId    Current round's victim.
 */
export function resolveRoundWithAbstentions(
  votes: Record<string, string>,
  _allVoterIds: string[],
  saboteurId: string,
  victimId: string,
): RoundOutcome {
  // Filter to only submitted (non-null/non-undefined) votes
  const submittedEntries = Object.entries(votes).filter(([, v]) => v != null);

  // Case D: everyone abstained
  if (submittedEntries.length === 0) {
    return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: false, accusedId: victimId };
  }

  // Count votes per candidate
  const voteCounts: Record<string, number> = {};
  for (const [, accused] of submittedEntries) {
    voteCounts[accused] = (voteCounts[accused] ?? 0) + 1;
  }

  const maxVotes = Math.max(...Object.values(voteCounts));
  const topCandidates = Object.keys(voteCounts).filter((id) => voteCounts[id] === maxVotes);

  if (topCandidates.length === 1) {
    // Case A: unique leader
    const accused = topCandidates[0];
    if (accused === saboteurId) {
      return { eliminatedId: saboteurId, reason: 'saboteur_caught', victimOverride: false, accusedId: saboteurId };
    }
    return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: false, accusedId: accused };
  }

  // Tie — check if victim voted (Case B) or abstained (Case C)
  const victimVote = votes[victimId];
  if (victimVote == null || !(victimId in votes)) {
    // Case C: tie + victim abstained → eliminate victim
    return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: false, accusedId: victimId };
  }

  // Case B: Victim Override Rule — victim's vote determines the accused
  if (victimVote === saboteurId) {
    return { eliminatedId: saboteurId, reason: 'saboteur_caught', victimOverride: true, accusedId: saboteurId };
  }
  return { eliminatedId: victimId, reason: 'victim_eliminated', victimOverride: true, accusedId: victimVote };
}

/**
 * Unified round resolution dispatcher.
 * Delegates to resolveRoundWithAbstentions for all player counts.
 */
export function resolveRound(
  votes: Record<string, string>,
  saboteurId: string,
  victimId: string,
  activeIds: string[],
): RoundOutcome {
  return resolveRoundWithAbstentions(votes, activeIds, saboteurId, victimId);
}

// ─── Final-2 jury resolution ──────────────────────────────────────────────────

/**
 * Resolve the Final-2 Jury Deduction Finale.
 *
 * Jury votes for who they think planted the bomb.
 * Strict majority correct → saboteur eliminated, victim wins.
 * Strict majority incorrect → victim eliminated, saboteur wins.
 * Tie → saboteur wins because the jury failed to expose them.
 */
export function resolveFinal2(
  juryVotes: Record<string, string>,
  saboteurId: string,
  victimId: string,
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

  // Tie: the saboteur stays hidden and wins.
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
