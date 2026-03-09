export const INCOMING_INTERACTION_PHASE_ORDER = [
  'week_start',
  'nominations',
  'hoh_results',
  'pov_results',
  'live_vote',
  'eviction_results',
] as const;

export type IncomingInteractionPhase = (typeof INCOMING_INTERACTION_PHASE_ORDER)[number];

export const INCOMING_INTERACTION_ELIGIBLE_PHASES = new Set<string>(
  INCOMING_INTERACTION_PHASE_ORDER,
);
