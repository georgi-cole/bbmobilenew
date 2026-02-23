/** Config for the Social Engine budget computation, adapted from BBMobile defaults. */
export const socialConfig = {
  /** Target spend fraction range [min, max] applied to DEFAULT_ENERGY. */
  targetSpendPctRange: [0.5, 0.9] as [number, number],
  /** Minimum number of social actions per AI player per phase. */
  minActionsPerPlayer: 1,
  /** Maximum number of social actions per AI player per phase. */
  maxActionsPerPlayer: 4,

  // ── SocialPolicy ────────────────────────────────────────────────────────
  /** Weighted probability map for action selection by AI players. */
  actionWeights: {
    ally: 3,
    protect: 2,
    betray: 1,
    nominate: 2,
    idle: 1,
  } as Record<string, number>,
  /** Affinity thresholds that classify a relationship as ally or enemy. */
  relationshipThresholds: {
    allyThreshold: 0.5,
    enemyThreshold: -0.5,
  },
  /** Categories used by computeOutcomeDelta to determine delta sign. */
  actionCategories: {
    friendlyActions: ['ally', 'protect'] as string[],
    aggressiveActions: ['betray', 'nominate'] as string[],
  },
  /** Affinity delta magnitudes applied by computeOutcomeDelta. */
  affinityDeltas: {
    friendlySuccess: 0.1,
    friendlyFailure: 0.02,
    aggressiveSuccess: -0.15,
    aggressiveFailure: -0.05,
  },

  // ── SocialInfluence ──────────────────────────────────────────────────────
  /** Clamping bounds [min, max] for nomination bias values. */
  nomBiasBounds: [-0.15, 0.15] as [number, number],
  /** Clamping bounds [min, max] for veto bias values. */
  vetoBiasBounds: [-0.1, 0.2] as [number, number],

  // ── SocialAIDriver ───────────────────────────────────────────────────────
  /** Milliseconds between AI action ticks. */
  tickIntervalMs: 375,
  /** When false the driver stops as soon as all budgets reach 0. */
  allowOverspend: false,
  /** Verbose console logging from the AI driver when true. */
  verbose: false,
  /**
   * Safety guard: maximum number of ticks before the driver auto-stops,
   * regardless of remaining budget. At one tick per 375 ms and at most
   * 4 actions per player, 30 ticks comfortably covers any realistic phase.
   */
  maxTicksPerPhase: 30,
};
