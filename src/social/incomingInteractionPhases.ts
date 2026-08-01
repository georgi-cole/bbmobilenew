export const INCOMING_INTERACTION_PHASE_ORDER = [
  'week_start',
  'loh_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pos_results',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'final3_comp1',
  'final3_comp2',
  'final3_comp3',
  'final3_decision',
] as const;

export type IncomingInteractionPhase = (typeof INCOMING_INTERACTION_PHASE_ORDER)[number];

export const INCOMING_INTERACTION_ELIGIBLE_PHASES = new Set<string>(
  INCOMING_INTERACTION_PHASE_ORDER,
);
