import type { ForcedShockType, GameState } from '../types'
import { expandCupidIds } from '../features/twists/cupidArrow'

export type CriticalRuleDimension =
  | 'nomination_authority'
  | 'nomination_eligibility'
  | 'nomination_count'
  | 'safety_replacement'
  | 'ordinary_eviction_voters'
  | 'tie_breaker'
  | 'eviction_authority'
  | 'eviction_count'
  | 'linked_exit'
  | 'roster_eligibility'
  | 'strategy_only'

export interface CriticalShockRuleDeclaration {
  /**
   * Critical engine dimensions this shock intentionally changes.
   * Empty means baseline rules remain.
   */
  changes: readonly CriticalRuleDimension[]
  /**
   * Human-readable reason for the declaration. This registry is deliberately
   * exhaustive over ForcedShockType so adding a new shock fails TypeScript
   * until its critical-game impact is reviewed.
   */
  rationale: string
}

/**
 * Exhaustive rule-impact declaration for every debug/production shock.
 *
 * IMPORTANT: this is not a substitute for engine tests. It is the review gate
 * that makes a new shock declare which nomination/eviction rules it changes.
 * criticalShockRuleMatrix.test.ts then exercises the high-risk declarations.
 */
export const FORCED_SHOCK_CRITICAL_RULES = {
  doubleEviction: {
    changes: ['nomination_count', 'eviction_count', 'tie_breaker'],
    rationale:
      'Three-person opening block and two exits; ordinary Classic voter eligibility stays intact.',
  },
  battleBack: {
    changes: ['roster_eligibility'],
    rationale:
      'A juror can return to active play; nomination and eviction rules are otherwise unchanged.',
  },
  vip: {
    changes: ['safety_replacement'],
    rationale: 'Double Trouble can save twice and create two replacement cycles.',
  },
  diamond: {
    changes: ['safety_replacement'],
    rationale: 'Halo Exchange transfers replacement-nominee choice to the Safety holder.',
  },
  coup: {
    changes: ['nomination_eligibility', 'safety_replacement', 'tie_breaker'],
    rationale:
      'Detox replaces the whole block, can nominate the current LOH, and hands an LOH-blocked tie to the POS holder.',
  },
  spotlight: {
    changes: ['safety_replacement'],
    rationale:
      'Force Majeure forces Safety use but does not change who casts the later eviction ballot.',
  },
  democracia: {
    changes: [
      'nomination_authority',
      'nomination_eligibility',
      'ordinary_eviction_voters',
      'tie_breaker',
    ],
    rationale:
      'The house elects leadership; a tied election can create co-LOHs who split nominations and are both excluded from the ordinary eviction ballot.',
  },
  dayStartShock: {
    changes: ['eviction_authority'],
    rationale: 'A direct production removal bypasses nominations and the house vote for that exit.',
  },
  twinShock: {
    changes: ['nomination_eligibility', 'safety_replacement', 'roster_eligibility'],
    rationale:
      'Lia/Ali cannot target each other, a twin Safety holder must save the paired nominee, and Ali can enter later.',
  },
  depressionShock: {
    changes: ['strategy_only'],
    rationale:
      'Decision preferences can invert, but eligibility, vote authority, and eviction authority do not change.',
  },
} satisfies Record<ForcedShockType, CriticalShockRuleDeclaration>

/** Full-season / settings rules that also alter the critical game engine. */
export const FORMAT_CRITICAL_RULES = {
  publicMode: {
    changes: ['nomination_count', 'safety_replacement'],
    rationale:
      'Adds an automatic third nominee and public pre-Safety save; the later house vote remains Classic.',
  },
  cupidArrow: {
    changes: [
      'nomination_eligibility',
      'nomination_count',
      'ordinary_eviction_voters',
      'linked_exit',
    ],
    rationale:
      'Pairs cannot target each other, nominations expand to pairs, pair ballots are joint, and linked partners leave together.',
  },
  voxPopuli: {
    changes: [
      'nomination_authority',
      'nomination_eligibility',
      'eviction_authority',
      'tie_breaker',
    ],
    rationale:
      'Every active housemate nominates; the audience, not the house or LOH, controls eviction.',
  },
} as const satisfies Record<string, CriticalShockRuleDeclaration>

function isActivePlayer(state: GameState, playerId: string): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId)
  return Boolean(player && player.status !== 'evicted' && player.status !== 'jury')
}

/**
 * Players holding the ordinary Classic leader role for voting purposes.
 * Cupid expands a single LOH into the linked pair; Democracia can supply two co-LOHs.
 */
export function getClassicLeaderRoleIds(state: GameState): string[] {
  if (state.coLohIds?.length) return [...state.coLohIds]
  return state.lohId ? expandCupidIds(state, [state.lohId]) : []
}

/**
 * Canonical ordinary-house-vote eligibility.
 *
 * Current block membership outranks every title: a player in nomineeIds cannot
 * cast an ordinary eviction ballot even if a shock also lets them retain LOH/POS
 * presentation status.
 */
export function canCastClassicEvictionVote(state: GameState, playerId: string): boolean {
  if (!isActivePlayer(state, playerId)) return false
  if (state.nomineeIds.includes(playerId)) return false
  if (getClassicLeaderRoleIds(state).includes(playerId)) return false
  return true
}

/**
 * Resolve the special tie-break authority after the ordinary vote.
 *
 * Democracia co-LOH days delegate the tie-break to the POS holder. Normal
 * Classic uses the LOH. In either case, a current nominee is ineligible to
 * break the tie; this matters for Detox, which can put the LOH on the block.
 */
export function getClassicEvictionTieBreakerId(state: GameState): string | null {
  const isCoLohDay = Boolean(state.coLohIds && state.coLohIds.length >= 2)
  const primaryCandidateId = isCoLohDay ? state.posWinnerId : state.lohId
  if (
    primaryCandidateId &&
    isActivePlayer(state, primaryCandidateId) &&
    !state.nomineeIds.includes(primaryCandidateId)
  ) {
    return primaryCandidateId
  }

  // Some shocks (currently Detox) can deliberately put the sitting LOH on the
  // block. A nominee cannot break their own eviction tie, so the POS holder
  // becomes the explicit emergency tie-break authority instead of silently
  // falling through to a random elimination.
  if (!isCoLohDay && state.lohId && state.nomineeIds.includes(state.lohId)) {
    const fallbackId = state.posWinnerId
    if (fallbackId && isActivePlayer(state, fallbackId) && !state.nomineeIds.includes(fallbackId)) {
      return fallbackId
    }
  }

  return null
}

/** Synthetic second-vote keys still belong to the same human voter. */
export function getCanonicalVoterId(voteKey: string): string {
  return voteKey.endsWith('__dv2') ? voteKey.slice(0, -'__dv2'.length) : voteKey
}
