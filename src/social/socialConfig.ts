import type { IncomingInteractionPriority, IncomingInteractionType } from './types';

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
  /**
   * Affinity delta magnitudes used for the DISPLAY / relationship storage.
   * Values are in the 0–100 display scale so each action produces a visible
   * percentage change in the social panel.
   */
  affinityDeltas: {
    friendlySuccess: 5,
    friendlyFailure: 1,
    aggressiveSuccess: -8,
    aggressiveFailure: -2,
  },
  /** Affinity delta map for incoming interaction responses (display scale). */
  incomingInteractionAffinityDeltas: {
    positive: 6,
    neutral: 1,
    negative: -8,
    accept: 6,
    decline: -8,
    dismiss: -3,
    ignore: -4,
  },
  /**
   * Score delta magnitudes used exclusively by computeOutcomeScore / evaluateOutcome
   * to derive the quality label ('Good', 'Bad', etc.) in the [-1, +1] range.
   * Kept separate from affinityDeltas so scaling one doesn't affect the other.
   */
  scoreDeltas: {
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

  // ── Incoming Interaction Autonomy ────────────────────────────────────────
  /**
   * Configuration for AI-driven incoming interaction scheduling.
   *
   * maxPerWeek      – advisory budget: target maximum interactions that can be
   *                   generated across a full game week (used for planning; not
   *                   strictly enforced per-week in the current implementation).
    * maxActive       – hard global cap: the maximum number of unresolved
    *                   interactions (visible + scheduled) that may exist at any
    *                   one time. Typically set to ~2× maxActiveVisible (e.g.
    *                   8 vs 4) so the scheduler can hold a small backlog while
    *                   still spacing deliveries across phases.
   * maxPerAI        – per-actor cap: an individual AI may have at most this many
   *                   unresolved interactions pending with the player at once.
   * cooldownTicks   – minimum number of game weeks that must pass after an AI
   *                   enqueues an interaction before it may enqueue another
   *                   (per-actor cooldown).
   * scoreThreshold  – minimum computed engagement score required before an
   *                   interaction is actually enqueued.
   * weights         – relative weights used when computing the engagement score.
   * randomVariance  – maximum ±fraction of random jitter added to each score.
   */
  incomingInteractionConfig: {
    maxPerWeek: 6,
    maxActive: 8,
    maxPerAI: 2,
    cooldownTicks: 2,
    scoreThreshold: 0.15,
    weights: {
      relationshipIntensity: 0.25,
      strategicUrgency: 0.5,
      personality: 0.15,
      eventPressure: 0.1,
      memoryIntensity: 0.1,
      trustMomentum: 0.05,
    },
    randomVariance: 0.05,
  },

  // ── Incoming Interaction Autonomy Tuning ─────────────────────────────────
  incomingInteractionAutonomyTuning: {
    /** Default personality factor for unlisted houseguests. */
    defaultPersonalityFactor: 0.5,
    /** Per-houseguest multipliers controlling outreach propensity. */
    personalityFactors: {
      finn: 0.3, // analytical, reserved
      mimi: 0.6, // warm but shy
      rae: 0.8, // assertive, high-contact
      nova: 0.7, // social, extroverted
      leo: 0.9, // high-energy strategist
      zara: 0.7,
      dante: 0.6,
      priya: 0.7,
      sam: 0.5,
      jax: 0.8,
      luna: 0.6,
      max: 0.5,
      ivy: 0.7,
      omar: 0.6,
      kai: 0.5,
    } as Record<string, number>,
    /** Default strategic urgency for phases not explicitly listed. */
    defaultPhaseUrgency: 0.3,
    /** Strategic urgency weights per phase. */
    phaseUrgency: {
      week_start: 0.5,
      nominations: 0.9,
      nomination_results: 0.8,
      pov_results: 0.7,
      pov_ceremony: 0.6,
      pov_ceremony_results: 0.7,
      live_vote: 0.95,
      eviction_results: 0.85,
      hoh_results: 0.8,
      social_1: 0.4,
      social_2: 0.4,
    } as Record<string, number>,
    /** Additional event pressure bonuses per phase. */
    phaseEventPressure: {
      nominations: 0.2,
      live_vote: 0.3,
      eviction_results: 0.2,
      pov_results: 0.1,
      hoh_results: 0.1,
    } as Record<string, number>,
    /** Affinity thresholds that drive interaction type selection. */
    interactionTypeThresholds: {
      highUrgency: { ally: 0.3, enemy: -0.3 },
      povResults: { ally: 0.3, enemy: -0.3 },
      hohEviction: { strongAlly: 0.5, mildAlly: 0.1, strongEnemy: -0.4 },
      social: { strongAlly: 0.4, mildAlly: 0.1, strongEnemy: -0.4, mildEnemy: -0.1 },
    },
  },

  // ── Incoming Interaction Delivery ─────────────────────────────────────────
  incomingInteractionDeliveryConfig: {
    /** Maximum unresolved interactions visible in the inbox at once. */
    maxActiveVisible: 4,
    /** Maximum interactions delivered per phase checkpoint. */
    maxDeliveredPerPhase: 1,
    /** Phase offsets applied when scheduling by priority. */
    priorityOffsets: {
      high: 0,
      medium: 1,
      low: 2,
    } as Record<IncomingInteractionPriority, number>,
    /** Default priority per interaction type. */
    defaultPriorityByType: {
      nomination_plea: 'high',
      alliance_proposal: 'high',
      deal_offer: 'high',
      warning: 'medium',
      gossip: 'medium',
      check_in: 'medium',
      compliment: 'low',
      snide_remark: 'low',
      other: 'medium',
    } as Record<IncomingInteractionType, IncomingInteractionPriority>,
    /** Drop low-priority items once they are overdue and the inbox is full. */
    lowPriorityDropAfterPhases: 3,
    /** Maximum number of phases a scheduled interaction may wait before expiring. */
    maxScheduledWaitPhases: 18,
    /** Maximum number of future delivery slots to scan when scheduling. */
    maxFutureSlots: 12,
    /** Dedupe rules for repetitive interactions. */
    dedupe: {
      /** Skip low-priority items if the sender already has a pending interaction. */
      blockLowPriorityIfActorPending: true,
      /** Minimum number of weeks between identical interaction types per actor. */
      sameTypeCooldownWeeks: 1,
      /** Minimum number of weeks between any low-priority interactions per actor. */
      lowPriorityCooldownWeeks: 1,
    },
  },

  // ── Incoming Interaction Debugging ───────────────────────────────────────
  incomingInteractionDebugConfig: {
    /** Maximum number of interaction decision logs to retain in state. */
    maxLogEntries: 250,
    /** Enable structured console logging for incoming interaction lifecycle events. */
    enableConsole: false,
  },

  // ── Social Memory ─────────────────────────────────────────────────────────
  socialMemoryConfig: {
    caps: {
      gratitude: 10,
      resentment: 10,
      neglect: 10,
      trustMomentum: 6,
    },
    decayPerWeek: {
      gratitude: 1,
      resentment: 1,
      neglect: 1,
      trustMomentum: 2,
    },
    recentEventsLimit: 5,
    affinityBiasWeight: 0.35,
    trustMomentumBiasWeight: 0.2,
    incomingInteractionDeltas: {
      positive: { gratitude: 2, trustMomentum: 1 },
      neutral: { trustMomentum: 0 },
      negative: { resentment: 2, trustMomentum: -1 },
      accept: { gratitude: 3, trustMomentum: 2 },
      decline: { resentment: 2, trustMomentum: -1 },
      dismiss: { resentment: 1, trustMomentum: -1 },
      ignore: { neglect: 3, trustMomentum: -2 },
    },
  },
};
