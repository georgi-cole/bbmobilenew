export const publicOpinionConfig = {
  DEFAULT_APPROVAL: 50,
  MIN_APPROVAL: 0,
  MAX_APPROVAL: 100,
  MAX_CYCLE_DELTA: 12,
  competitionImpact: {
    hohWin: 6,
    povWin: 4,
    nominated: -2,
    evictionVotedOut: -3,
  },
  socialImpact: {
    positiveInteraction: 2,
    negativeInteraction: -2,
    betrayal: -4,
  },
  strategyImpact: {
    boldNomination: 3,
    lostComp: -1,
  },
  directionRewards: {
    success: 5,
    partial: 2,
    fail: -2,
    counter: -4,
  },
  approvalBands: [
    { min: 0, max: 19, label: 'hated' },
    { min: 20, max: 39, label: 'disliked' },
    { min: 40, max: 59, label: 'mixed' },
    { min: 60, max: 79, label: 'liked' },
    { min: 80, max: 100, label: 'beloved' },
  ],
  directionsPerCycle: 2,
} as const;
