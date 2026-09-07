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

export type SilentSaboteurEvidenceKind = 'opportunity' | 'motive' | 'contradiction' | 'corroboration';

/** A single observation from the active case. It is suggestive, never conclusive. */
export interface SilentSaboteurObservation {
  kind: SilentSaboteurEvidenceKind;
  detail: string;
  interpretation: string;
}

export interface SilentSaboteurLead {
  /** Internal, deliberately imperfect AI suspicion weighting. Never shown as a verdict. */
  score: number;
  observations: SilentSaboteurObservation[];
}

/**
 * The Case File accumulates a small number of observations while a case is
 * active. The saboteur is more likely to be connected to a lead, but a decoy
 * can look stronger and an absence of notes is never an alibi.
 */
export type SilentSaboteurRoundEvidence = Record<string, SilentSaboteurLead>;

const EVIDENCE_KINDS: SilentSaboteurEvidenceKind[] = ['opportunity', 'motive', 'contradiction', 'corroboration'];

const CASE_OBSERVATIONS: Record<SilentSaboteurEvidenceKind, Omit<SilentSaboteurObservation, 'kind'>[]> = {
  opportunity: [
    { detail: 'was near the hallway just before the room erupted.', interpretation: 'The hallway was busy, but the timing remains awkward.' },
    { detail: 'returned after everyone else had settled in.', interpretation: 'A brief absence leaves room for questions.' },
    { detail: 'left the kitchen moments before the disturbance was noticed.', interpretation: 'Bad timing can still be coincidence.' },
  ],
  motive: [
    { detail: 'had a tense exchange with the victim earlier that evening.', interpretation: 'The missing context matters.' },
    { detail: 'defended the victim a little too quickly when the room turned.', interpretation: 'Loyalty can be sincere, or carefully staged.' },
    { detail: 'went quiet when the victim’s name came up.', interpretation: 'Pressure affects people in different ways.' },
  ],
  contradiction: [
    { detail: 'gave a different order of events than the others remembered.', interpretation: 'Memory bends under pressure.' },
    { detail: 'paused before answering a simple question about the evening.', interpretation: 'A pause can hold more than one explanation.' },
    { detail: 'changed the subject when the timeline became uncomfortable.', interpretation: 'A social instinct—or a useful escape?' },
  ],
  corroboration: [
    { detail: 'was placed near the commotion by two separate accounts.', interpretation: 'Two accounts help, but neither saw the whole picture.' },
    { detail: 'was remembered leaving the same conversation by more than one person.', interpretation: 'Independent memories can still share the same blind spot.' },
    { detail: 'was described as unusually calm by two people in the room.', interpretation: 'Composure is not the same thing as concealment.' },
  ],
};

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

// ─── Case File evidence ──────────────────────────────────────────────────────

export function buildRoundEvidence(
  seed: number,
  round: number,
  activeIds: string[],
  saboteurId: string,
  victimId: string,
  previousEvidence: SilentSaboteurRoundEvidence = {},
): SilentSaboteurRoundEvidence {
  const suspects = activeIds.filter((id) => id !== victimId);
  const evidenceSeed = (
    seed ^ (round * 0x85ebca6b) ^ fnv1a32(saboteurId) ^ fnv1a32(victimId)
  ) >>> 0;
  const rng = mulberry32(evidenceSeed);
  const decoyCandidates = suspects.filter((id) => id !== saboteurId);
  // Every round highlights two threads: one is often, but not always, tied to
  // the saboteur; the other gives the case a credible alternative explanation.
  const primaryId = decoyCandidates.length > 0 && rng() >= 0.58
    ? seededPick(rng, decoyCandidates)
    : saboteurId;
  const secondaryCandidates = suspects.filter((id) => id !== primaryId);
  const secondaryId = secondaryCandidates.length === 0
    ? null
    : primaryId !== saboteurId && secondaryCandidates.includes(saboteurId) && rng() < 0.16
      ? saboteurId
      : seededPick(rng, secondaryCandidates);
  const firstSignatureIndex = fnv1a32(saboteurId + ':first') % EVIDENCE_KINDS.length;
  const secondSignatureIndex = (
    firstSignatureIndex + 1 + (fnv1a32(saboteurId + ':second') % (EVIDENCE_KINDS.length - 1))
  ) % EVIDENCE_KINDS.length;
  const saboteurSignature: [SilentSaboteurEvidenceKind, SilentSaboteurEvidenceKind] = [
    EVIDENCE_KINDS[firstSignatureIndex],
    EVIDENCE_KINDS[secondSignatureIndex],
  ];

  return Object.fromEntries(suspects.map((id) => {
    const previous = previousEvidence[id];
    const isPrimary = id === primaryId;
    const isSecondary = id === secondaryId;
    const hasFreshObservation = isPrimary || isSecondary;
    const baselineScore = 36 + Math.floor(rng() * 15) + (id === saboteurId ? 7 : 0);
    const roundScore = Math.min(88, baselineScore + (isPrimary ? 18 : isSecondary ? 12 : 0));
    const priorObservations = previous?.observations ?? [];
    const kind = id === saboteurId
      ? saboteurSignature[priorObservations.length % saboteurSignature.length]
      : priorObservations[0]?.kind ?? EVIDENCE_KINDS[fnv1a32(id + ':thread') % EVIDENCE_KINDS.length];
    const observationsForKind = CASE_OBSERVATIONS[kind];
    const observationOffset = (fnv1a32(id) + round + Math.floor(rng() * observationsForKind.length)) % observationsForKind.length;
    const candidateObservation: SilentSaboteurObservation = { kind, ...observationsForKind[observationOffset] };
    const observation = priorObservations.some(({ detail }) => detail === candidateObservation.detail)
      ? { kind, ...observationsForKind[(observationOffset + 1) % observationsForKind.length] }
      : candidateObservation;
    const observations = hasFreshObservation
      ? [...priorObservations, observation].slice(-2)
      : priorObservations;
    const score = previous
      ? hasFreshObservation
        ? Math.round((previous.score + roundScore) / 2)
        : Math.round((previous.score * 4 + baselineScore) / 5)
      : roundScore;

    return [id, { score, observations }];
  }));
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
  evidence?: SilentSaboteurRoundEvidence,
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
  if (!evidence || !candidates.some((id) => evidence[id])) {
    return seededPick(rng, candidates);
  }

  // Leads affect suspicion, not certainty. Even a concerning lead remains
  // only one input, and each voter keeps deterministic individual variation.
  const weights = candidates.map((id) => 1 + (evidence[id]?.score ?? 40) / 18 + rng() * 1.25);
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let cursor = rng() * totalWeight;
  for (let index = 0; index < candidates.length; index++) {
    cursor -= weights[index];
    if (cursor <= 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
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
  evidence?: SilentSaboteurRoundEvidence,
): string | null {
  const candidates = getValidSaboteurCandidates(activeIds, voterId, victimId ?? null);
  if (candidates.length === 0) return null;
  return pickVoteForAi(seed, round, voterId, activeIds, victimId ?? null, evidence);
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
  evidence?: SilentSaboteurRoundEvidence,
): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const id of aiIds) {
    const accusedId = pickVoteForAiOrAbstain(seed, round, id, activeIds, victimId ?? null, evidence);
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

/** Deterministic ballots for a survivor jury, where no saboteur remains. */
export function buildAiSurvivorJuryVotes(
  seed: number,
  jurorIds: string[],
  finalistIds: [string, string],
): Record<string, string> {
  const votes: Record<string, string> = {};
  for (const jurorId of jurorIds) {
    const jurySeed = ((seed ^ fnv1a32(jurorId) ^ 0x51a7e) >>> 0);
    votes[jurorId] = seededPick(mulberry32(jurySeed), finalistIds);
  }
  return votes;
}

/** Resolve a survivor jury. Tied juries use a seeded tiebreak for one winner. */
export function resolveSurvivorJury(
  seed: number,
  juryVotes: Record<string, string>,
  finalistIds: [string, string],
): string {
  const [first, second] = finalistIds;
  const firstVotes = Object.values(juryVotes).filter((id) => id === first).length;
  const secondVotes = Object.values(juryVotes).filter((id) => id === second).length;
  if (firstVotes > secondVotes) return first;
  if (secondVotes > firstVotes) return second;
  return seededPick(mulberry32((seed ^ 0x7f4a7c15) >>> 0), finalistIds);
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
