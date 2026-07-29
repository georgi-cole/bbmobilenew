export interface IncomingInteractionValidityRule {
  senderMustBeNominee?: boolean
  senderMustBeHoh?: boolean
  senderMustHoldSafety?: boolean
  humanMustBeHoh?: boolean
  humanMustHoldSafety?: boolean
  humanMustBeOffBlock?: boolean
  humanMustBeEligibleVoter?: boolean
  subjectMustBeInHouse?: boolean
  allowedPhases?: readonly string[]
  invalidPhases?: readonly string[]
}

/**
 * Pure-data validity rules keyed by scenario. These can be moved to validated
 * live config later without changing the evaluator or message components.
 */
export const INCOMING_INTERACTION_VALIDITY_BANK: Record<string, IncomingInteractionValidityRule> = {
  nominee_veto_pitch: {
    senderMustBeNominee: true,
    humanMustHoldSafety: true,
  },
  nominee_hoh_plea: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
  },
  nomination_aftershock: {
    senderMustBeNominee: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  nominee_campaign: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  post_veto_campaign: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['social_2', 'live_vote'],
  },
  live_vote_pitch: {
    senderMustBeNominee: true,
    humanMustBeOffBlock: true,
    humanMustBeEligibleVoter: true,
    allowedPhases: ['live_vote'],
  },
  post_veto_gratitude: {
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  hoh_safety_request: {
    senderMustBeNominee: false,
    humanMustBeHoh: true,
  },
  safety_holder_consults_loh: {
    senderMustHoldSafety: true,
    humanMustBeHoh: true,
  },
  loh_consults_safety_holder: {
    senderMustBeHoh: true,
    humanMustHoldSafety: true,
  },
  nominee_understands_loh: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  nominee_confronts_loh: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  replacement_nominee_reacts_to_loh: {
    senderMustBeNominee: true,
    humanMustBeHoh: true,
    invalidPhases: ['live_vote', 'eviction_results', 'week_end', 'week_start'],
  },
  betrayal_warning: {
    subjectMustBeInHouse: true,
  },
  generic_gossip: {
    subjectMustBeInHouse: true,
  },
}

export function getIncomingInteractionValidityRule(
  scenarioKey: string | null
): IncomingInteractionValidityRule | null {
  return scenarioKey ? (INCOMING_INTERACTION_VALIDITY_BANK[scenarioKey] ?? null) : null
}
