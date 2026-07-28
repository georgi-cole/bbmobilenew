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
    strongPerformance: 1,
    weakPerformance: -1,
    lastPlace: -2,
    quitEarly: -4,
  },
  socialImpact: {
    positiveInteraction: 2,
    negativeInteraction: -2,
    betrayal: -4,
    highQualityInteraction: 1,
    poorInteraction: -1,
    inactiveDay: -1,
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
   * A seeded random number of headline events fires per in-game day (week),
   * in the range [headlineEventsPerDayMin, headlineEventsPerDayMax].
   * Each event picks a severity band by weighted random draw.
   */
  headlineEventsPerDayMin: 2,
  headlineEventsPerDayMax: 3,
  headlineSeverityBands: {
    mild: { minMag: 3, maxMag: 8 },
    dramatic: { minMag: 9, maxMag: 18 },
    shocking: { minMag: 19, maxMag: 30 },
  },
  /** Cumulative weights for mild / dramatic / shocking severity (should sum to 1.0). */
  headlineSeverityWeights: { mild: 0.5, dramatic: 0.35, shocking: 0.15 },
  /**
   * Background drift applied to players who did NOT receive a headline event.
   * The daily drift is a uniformly random non-zero integer with magnitude in
   * [1, backgroundDriftMax], with a randomly chosen sign.
   */
  backgroundDriftMax: 8,
  /**
   * Transparent, bounded recovery at very low approval. This prevents a bad
   * opening stretch from becoming permanent while still requiring real actions
   * for a substantial comeback. The recovery is always shown in the feed.
   */
  lowApprovalRecovery: {
    criticalThreshold: 10,
    criticalDelta: 3,
    lowThreshold: 25,
    lowDelta: 2,
    softThreshold: 35,
    softDelta: 1,
  },
  /**
   * Threshold (0–100) at which a mission is considered complete
   * via partial-progress accumulation.
   */
  missionCompletionThreshold: 100,
  /** Progress weight awarded when a direct action satisfies a mission trigger. */
  missionDirectProgressWeight: 70,
  /** Progress weight awarded for an indirect / social action toward a mission. */
  missionIndirectProgressWeight: 30,

  // ── Event-driven update config ─────────────────────────────────────────────

  /**
   * Maximum number of visible Public Feed posts per in-game day.
   * Approval deltas continue to apply even when the budget is exhausted;
   * only the feed card is suppressed.
   */
  feedBudgetPerDay: 6,

  /**
   * Advisory priority level for each event type (higher = more important).
   * This value is advisory and can be used by callers to prefer higher-priority
   * events when enforcing the daily feed budget; the current budget gate itself
   * does not reorder or reselect events by priority.
   */
  eventFeedPriority: {
    eviction: 3,
    nomination: 2,
    public_save: 2,
    pov_save: 1,
    hoh_win: 1,
    pov_win: 1,
  } as Record<string, number>,

  /**
   * Per-event caps on the approval delta magnitude for event-driven reactions.
   * These are applied in addition to the global MAX_CYCLE_DELTA guard.
   */
  maxDeltaPerEvent: {
    nomination_reaction: 5,
    eviction_reaction: 6,
    pov_save_reaction: 4,
    public_save_reaction: 4,
  },

  /**
   * Approval-band thresholds used by the reaction engine to classify players as
   * liked, beloved, disliked, or hated when computing event-driven reactions.
   */
  reactionThresholds: {
    beloved: 80,
    liked: 60,
    disliked: 40,
    hated: 20,
  },

  /**
   * Approval deltas applied immediately after nominations, based on the approval
   * band of the nominee at the time of nomination.
   *
   * Positive values are boosts (sympathy), negative values are penalties.
   */
  nominationReactions: {
    /** LOH penalty for nominating a beloved player. */
    hohBelovedNomineePenalty: -4,
    /** LOH penalty for nominating a liked player. */
    hohLikedNomineePenalty: -2,
    /** Sympathy boost for a beloved player being nominated. */
    nomineeSympathyBeloved: 3,
    /** Sympathy boost for a liked player being nominated. */
    nomineeSympathyLiked: 2,
    /** No extra sympathy for mixed/disliked nominees (standard penalty already applies). */
    nomineeSympathyMixed: 0,
  },

  /**
   * Approval deltas applied immediately after an eviction is committed,
   * based on the approval band of the evicted player.
   *
   * "Responsible actors" are the LOH and the POS holder (if used) — they are
   * credited or blamed depending on who was evicted.
   */
  evictionReactions: {
    /** LOH / responsible actor penalty when a beloved player is evicted. */
    belovedEvictedResponsiblePenalty: -5,
    /** LOH / responsible actor penalty when a liked player is evicted. */
    likedEvictedResponsiblePenalty: -3,
    /** LOH / responsible actor boost when a disliked player is evicted. */
    dislikedEvictedResponsibleBoost: 4,
    /** LOH / responsible actor boost when a hated player is evicted. */
    hatedEvictedResponsibleBoost: 6,
    /** Extra penalty applied to the evicted player when they are beloved (fan outrage). */
    evictedBelovedFinalPenalty: -3,
    /** Small sympathy boost applied to the evicted player when they are disliked/hated (underdog exit). */
    evictedDislikedFinalBoost: 2,
  },

  /**
   * Approval deltas for POS and public-save twist reactions.
   */
  povSaveReactions: {
    /** Boost for the POS holder when they use it to save a liked/beloved player. */
    saveLikedPlayerBoost: 3,
    /** Penalty for the POS holder when they save a disliked/hated player. */
    saveDislikedPlayerPenalty: -2,
    /** Boost for the saved player when POS or public-save is used. */
    savedPlayerBoost: 2,
  },
} as const
