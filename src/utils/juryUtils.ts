/**
 * Jury utility functions for the Finale / Final Jury Voting sequence.
 *
 * All functions are pure (no side-effects) to keep them easily testable.
 */

import { mulberry32 } from '../store/rng'
import type { RealityDomainState } from '../social/reality'
import { computeRealityJuryEvaluation, realityJuryEvaluationScore } from '../social/reality'

// ─── Jury composition ────────────────────────────────────────────────────────

/**
 * Returns the number of "pre-jury" evictions (players evicted before jury).
 * Formula: totalPlayers - 2 (finalists) - jurySize.
 * e.g. 12 total, 7 jury → 3 pre-jury evictions.
 */
export function nonJuryEvictionCount(totalPlayers: number, jurySize: number): number {
  return Math.max(0, totalPlayers - 2 - jurySize)
}

/**
 * Given the 0-based index of a player's eviction (how many players were
 * already evicted/jury when they left), decide whether they become a juror.
 */
export function shouldBeJuror(
  evictionIndex: number,
  totalPlayers: number,
  jurySize: number
): boolean {
  return evictionIndex >= nonJuryEvictionCount(totalPlayers, jurySize)
}

/**
 * If there is an even number of jurors, promote the next eligible pre-jury
 * evictee to break the potential tie (ensures odd jury count).
 *
 * @param jurorIds       Current jury member IDs (ordered: most-recent last).
 * @param preJuryIds     Pre-jury evictee IDs (ordered: most-recent last).
 * @returns              Possibly extended juror list with one extra member.
 */
export function ensureOddJurors(jurorIds: string[], preJuryIds: string[]): string[] {
  if (jurorIds.length % 2 === 1) return jurorIds
  // Pick the most recently evicted pre-juror not already in the jury
  // (prevents duplicates when jury-return mechanic already promoted them).
  const extra = [...preJuryIds].reverse().find((id) => !jurorIds.includes(id))
  return extra ? [...jurorIds, extra] : jurorIds
}

export type PublicVoteParityResolution = {
  jurorIds: string[]
  publicVoteWeight: 1 | 2
}

/**
 * Keep the total finale vote weight odd when a public ballot is present.
 *
 * Prefer an even number of regular Tribunal members (normally eight), then add
 * one public vote. If no eligible pre-Tribunal player can be promoted, the
 * public ballot is explicitly worth two votes instead.
 */
export function resolvePublicVoteParity(
  jurorIds: string[],
  eligiblePreJuryIds: string[],
  publicVoteEnabled: boolean
): PublicVoteParityResolution {
  if (!publicVoteEnabled) {
    return {
      jurorIds: ensureOddJurors(jurorIds, eligiblePreJuryIds),
      publicVoteWeight: 1,
    }
  }

  if (jurorIds.length % 2 === 0) {
    return { jurorIds, publicVoteWeight: 1 }
  }

  const extra = [...eligiblePreJuryIds].reverse().find((id) => !jurorIds.includes(id))

  if (extra) {
    return {
      jurorIds: [...jurorIds, extra],
      publicVoteWeight: 1,
    }
  }

  return { jurorIds, publicVoteWeight: 2 }
}

/**
 * Jury-return mechanic: pick the pre-jury evictee who "won their way back"
 * (highest score proxy = last evicted pre-juror, per bbmobile spec).
 * Returns the player ID to promote to jury, or null if none eligible.
 */
export function juryReturnCandidate(preJuryIds: string[]): string | null {
  return preJuryIds.length > 0 ? preJuryIds[preJuryIds.length - 1] : null
}

// ─── Voting ──────────────────────────────────────────────────────────────────

/**
 * Count votes per finalist.
 * @param votes  Record mapping jurorId → finalistId.
 * @returns      Record mapping finalistId → vote count.
 */
export function tallyVotes(
  votes: Record<string, string>,
  voteWeights: Record<string, number> = {}
): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const [jurorId, finalistId] of Object.entries(votes)) {
    const weight = Math.max(1, Math.floor(voteWeights[jurorId] ?? 1))
    tally[finalistId] = (tally[finalistId] ?? 0) + weight
  }
  return tally
}

/**
 * Determine the winner from tallied votes.
 * On a tie, falls back to seeded RNG.
 * When `americasVoteEnabled` is true the UI labels the tiebreak as "America's Vote",
 * but the underlying resolution is identical (seeded RNG).
 *
 * @param tally              Vote counts per finalist.
 * @param finalistIds        Exactly 2 finalist IDs.
 * @param seed               RNG seed for deterministic tiebreak.
 * @returns                  Winner ID.
 */
export function determineWinner(
  tally: Record<string, number>,
  finalistIds: string[],
  seed: number
): string {
  if (finalistIds.length < 2) return finalistIds[0] ?? ''
  const [a, b] = finalistIds
  const aVotes = tally[a] ?? 0
  const bVotes = tally[b] ?? 0

  if (aVotes !== bVotes) return aVotes > bVotes ? a : b

  // Tie: use seeded RNG (deterministic; UI may label this "America's Vote").
  const rng = mulberry32(seed)
  return rng() < 0.5 ? a : b
}

// ─── AI juror voting ─────────────────────────────────────────────────────────

/** Simple hash of a string to a 32-bit integer (for per-juror RNG derivation). */
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0
  }
  return h
}

/**
 * Deterministically pick a vote for an AI juror.
 * XORs the juror's ID hash with the game seed so each juror produces a
 * consistent but distinct result for a given seed.
 *
 * @param jurorId      The voting juror's player ID.
 * @param finalistIds  Exactly 2 finalist IDs.
 * @param seed         Game RNG seed.
 * @returns            The finalist ID the juror votes for.
 */
export function realityJurorScorecard(
  jurorId: string,
  finalistIds: string[],
  reality: RealityDomainState | undefined
): Record<string, number> | undefined {
  if (!reality || finalistIds.length === 0) return undefined
  const hasEvidence = finalistIds.some((finalistId) => {
    const edge = reality.relationships[jurorId]?.[finalistId]
    return (
      Boolean(
        reality.juryEvaluations.find(
          (entry) => entry.jurorId === jurorId && entry.finalistId === finalistId
        )
      ) ||
      Boolean(
        reality.events.find(
          (event) =>
            event.juryEligible &&
            (event.actorId === finalistId || event.targetIds.includes(finalistId))
        )
      ) ||
      Boolean(
        edge &&
        (edge.familiarity > 0 ||
          edge.positiveAnchorEventIds.length > 0 ||
          edge.negativeAnchorEventIds.length > 0)
      )
    )
  })
  if (!hasEvidence) return undefined
  return Object.fromEntries(
    finalistIds.map((finalistId) => {
      const evaluation = computeRealityJuryEvaluation(reality, jurorId, finalistId, false)
      return [finalistId, realityJuryEvaluationScore(evaluation)]
    })
  )
}

export function aiJurorVote(
  jurorId: string,
  finalistIds: string[],
  seed: number,
  reality?: RealityDomainState,
  scorecard?: Record<string, number>
): string {
  if (finalistIds.length === 0) return ''
  const rng = mulberry32((seed ^ hashStr(jurorId)) >>> 0)
  const scores = scorecard ?? realityJurorScorecard(jurorId, finalistIds, reality)
  if (scores) {
    return [...finalistIds]
      .map((finalistId) => ({
        finalistId,
        score: (scores[finalistId] ?? 0) + (rng() - 0.5) * 3,
      }))
      .sort(
        (left, right) => right.score - left.score || left.finalistId.localeCompare(right.finalistId)
      )[0].finalistId
  }
  return finalistIds[Math.floor(rng() * finalistIds.length)]
}

// ─── Phrase pools ─────────────────────────────────────────────────────────────

/**
 * Clue-style jury vote lines — cryptic and cinematic, never naming the finalist.
 * Each line is a dramatic statement the juror delivers before the vote is revealed.
 */
export const JURY_LOCKED_LINES: string[] = [
  'I vote for the person who survived the chopping block so many times I lost count.',
  'My vote goes to the finalist who turned chaos into a strategy and never looked back.',
  "I'm casting my ballot for the player who was underestimated until it was far too late.",
  'I vote for the one who played this game entirely on their own terms.',
  'My jury vote belongs to the finalist who made the big move when it mattered most.',
  "I vote for the person whose game I couldn't help but respect, even when it hurt me.",
  "I'm voting for the player who didn't just survive this house — they mastered it.",
  'My vote goes to the finalist who showed me what it really means to want this.',
  'I vote for the person who adapted every single week and never once panicked.',
  "I'm casting my vote for the one who walked into this house with a plan and executed it.",
]

/** Variations shown when the public casts the final vote. */
export const PUBLIC_JURY_VOTE_LINES: string[] = [
  'The public has also cast their vote for the person who made this season great.',
  'The public has made their choice for the finalist who made this season unforgettable.',
  'The public has delivered their vote for the player who made this season special.',
  'The public has weighed in for the finalist who made this season one to remember.',
  'The public has cast their vote for the person who made this season shine.',
]

/** Plea templates used when POS holder asks nominees for their pleas at Final 4. */
export const NOMINEE_PLEA_TEMPLATES: string[] = [
  "Please keep me in this game — I haven't finished what I came here to do. 🙏",
  "I've been loyal from day one and I promise to have your back in the Final 3. Please keep me.",
  "You know you can trust me more than anyone else on that block. I'm begging you to let me stay. 🙏",
  "I've fought too hard to go home now. Give me the chance to prove I deserve to be here.",
  "Everything I've done in this game has been for us. Please don't send me home now.",
]

/** Banter templates per finalist — fill in {finalist} with the name. */
export const JURY_BANTER_TEMPLATES = {
  positive: [
    'You played the game from day one.',
    'You earned every single vote in this house.',
    'Your game was flawless — well done.',
    'You dominated socially and competitively.',
    "Nobody saw you coming, and that's a great game.",
  ],
  critical: [
    'You let others do the heavy lifting.',
    'You were lucky to be in the right alliances.',
    'Your jury management could have been better.',
    'You coasted to the end rather than competing.',
    'Close, but not quite the winner I envisioned.',
  ],
}

/** Pick a random phrase from a pool using a deterministic RNG. */
export function pickPhrase(pool: string[], seed: number, idx: number): string {
  const rng = mulberry32((seed ^ idx) >>> 0)
  return pool[Math.floor(rng() * pool.length)]
}
