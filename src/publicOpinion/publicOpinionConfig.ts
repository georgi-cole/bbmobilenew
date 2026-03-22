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
  /**
   * Headline / public-reaction event settings.
   * Up to headlineEventsPerDay visible events fire per in-game day (week).
   * Each event picks a severity band by weighted random draw.
   */
  headlineEventsPerDay: 3,
  headlineSeverityBands: {
    mild:     { minMag: 3,  maxMag: 8  },
    dramatic: { minMag: 9,  maxMag: 18 },
    shocking: { minMag: 19, maxMag: 30 },
  },
  /** Cumulative weights for mild / dramatic / shocking severity (must sum ≤ 1). */
  headlineSeverityWeights: { mild: 0.50, dramatic: 0.35, shocking: 0.15 },
  /**
   * Background drift applied to players who did NOT receive a headline event.
   * The daily drift is a uniformly random value in ±backgroundDriftMax.
   */
  backgroundDriftMax: 8,
  /**
   * Threshold (0–100) at which a mission is considered complete
   * via partial-progress accumulation.
   */
  missionCompletionThreshold: 100,
  /** Progress weight awarded when a direct action satisfies a mission trigger. */
  missionDirectProgressWeight: 70,
  /** Progress weight awarded for an indirect / social action toward a mission. */
  missionIndirectProgressWeight: 30,
} as const;
