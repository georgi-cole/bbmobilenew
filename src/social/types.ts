// Social module types – scaffold for the bbmobilenew social subsystem.
// Engine, policy, maneuvers and UI will be added in subsequent PRs.

/** Per-player energy budget for social actions this phase. */
export type SocialEnergyBank = Record<string, number>;

/** Directed relationship from one player toward another. */
export interface RelationshipEntry {
  affinity: number;
  tags: string[];
}

/** Full relationship graph: outer key = source player ID, inner key = target player ID. */
export type RelationshipsMap = Record<string, Record<string, RelationshipEntry>>;

export type DramaArcType = 'romance' | 'bromance' | 'rivalry' | 'betrayal';
export type DramaArcStage =
  | 'spark'
  | 'building'
  | 'established'
  | 'strained'
  | 'climax'
  | 'resolved';
export interface DramaArc {
  id: string;
  type: DramaArcType;
  participantIds: [string, string];
  stage: DramaArcStage;
  intensity: number;
  startedWeek: number;
  lastAdvancedWeek: number;
  public: boolean;
  /** Players who privately know about an otherwise secret arc. */
  discoveredByIds?: string[];
  /** Intimate arcs are exclusive; overlapping arcs can cause betrayal fallout. */
  exclusive?: boolean;
  status: 'active' | 'resolved';
}
export type DramaRumourKind =
  | 'secret_alliance'
  | 'secret_romance'
  | 'targeting'
  | 'fake_deal'
  | 'personal_comment';
export type DramaRumourTruth = 'true' | 'false' | 'uncertain';
export interface DramaRumourListener {
  playerId: string;
  sourceId: string;
  confidence: number;
  believed: boolean;
  heardWeek: number;
}
export interface DramaRumour {
  id: string;
  kind: DramaRumourKind;
  originatorId: string;
  subjectId: string;
  truth: DramaRumourTruth;
  claim?: string;
  evidence?: 'none' | 'weak' | 'credible' | 'confirmed';
  sourceChain?: string[];
  createdWeek: number;
  expiresWeek: number;
  listeners: DramaRumourListener[];
  status: 'circulating' | 'exposed' | 'dead';
  exposureWeek?: number;
}
export type DramaBeliefKind =
  | 'loyal'
  | 'promise_keeper'
  | 'unreliable'
  | 'strategic_threat'
  | 'secretive'
  | 'romantic_interest'
  | 'ride_or_die'
  | 'rival';
export interface DramaAlliance {
  id: string;
  participantIds: [string, string];
  formedWeek: number;
  lastUpdatedWeek: number;
  status: 'active' | 'strained' | 'broken';
  secrecy: 'secret' | 'public';
  origin: 'proposal' | 'incoming' | 'story';
  loyaltyByPlayer: Record<string, number>;
  primaryForIds: string[];
  falsePretenceByIds: string[];
  discoveredByIds: string[];
}

export interface DramaBelief {
  id: string;
  holderId: string;
  subjectId: string;
  kind: DramaBeliefKind;
  confidence: number;
  sentiment: number;
  sourceId: string;
  createdWeek: number;
  lastUpdatedWeek: number;
}
export interface DramaHouseEvent {
  id: string;
  type:
    | 'arc_beat'
    | 'rumour_spread'
    | 'exposure'
    | 'discovery'
    | 'confrontation'
    | 'reconciliation'
    | 'alliance_beat';
  week: number;
  phase: string;
  participantIds: string[];
  text: string;
  title?: string;
  detail?: string;
  consequence?: string;
  relatedArcId?: string;
  relatedRumourId?: string;
  public: boolean;
  severity: 'quiet' | 'notable' | 'major';
  createdAt: number;
}
export interface DramaSocialNetwork {
  arcs: DramaArc[];
  alliances: DramaAlliance[];
  rumours: DramaRumour[];
  beliefs: DramaBelief[];
  events: DramaHouseEvent[];
  pacing: {
    week: number;
    arcsStartedThisWeek: number;
    rumourHopsThisWeek: number;
    publicEventsThisWeek: number;
    privateDiscoveriesThisWeek: number;
    lastPublicEventWeek: number;
    lastProcessedPhase: string | null;
  };
}

export interface SocialMemoryEvent {
  type: string;
  actorId: string;
  targetId: string;
  week: number;
  timestamp: number;
  interactionType?: IncomingInteractionType;
  responseType?: IncomingInteractionResponseType;
}

export interface SocialMemoryEntry {
  gratitude: number;
  resentment: number;
  neglect: number;
  trustMomentum: number;
  recentEvents: SocialMemoryEvent[];
}

/** Directed social memory graph: actorId → targetId → memory entry. */
export type SocialMemoryMap = Record<string, Record<string, SocialMemoryEntry>>;

/** Snapshot of social activity produced at the end of a game phase. */
export interface SocialPhaseReport {
  id: string;
  week: number;
  summary: string;
  players: string[];
  timestamp: number;
}

/** A single recorded social action executed during a phase. */
export interface SocialActionLogEntry {
  actionId: string;
  actorId: string;
  targetId: string;
  /** All recipients for a multi-target action (targetId remains the primary). */
  targetIds?: string[];
  /** Per-recipient relationship changes for a multi-target action. */
  targetDeltas?: Record<string, number>;
  /**
   * For primaryPlusSubject actions: the player being talked *about*.
   * When present, the narrative should reference this player rather than
   * (or in addition to) targetId.
   */
  subjectId?: string;
  /** Structured context used to render action-specific history without parsing text. */
  context?: {
    lohPlanType?: 'current_target' | 'backup_plan';
  };
  /** Energy deducted (backward-compatible; prefer `costs.energy`). */
  cost: number;
  delta: number;
  outcome: 'success' | 'failure';
  /** Actor's energy after the action (backward-compatible; prefer `balancesAfter.energy`). */
  newEnergy: number;
  timestamp: number;
  /** In-game week in which the action happened, used by daily engagement systems. */
  week?: number;
  /** Normalised outcome score in [-1, +1] produced by the SocialPolicy evaluator. */
  score?: number;
  /** Human-readable outcome label (e.g. 'Good', 'Bad') produced by the evaluator. */
  label?: string;
  /**
   * Origin of the action: 'manual' for human player actions, 'system' for
   * background AI actions.  Used by Diary Room and activity routing to
   * distinguish user-initiated interactions from background game activity.
   */
  source?: 'manual' | 'system';
  /** Full multi-resource costs deducted for this action. */
  costs?: { energy: number; influence: number; info: number };
  /** All resource balances after deductions and yields were applied. */
  balancesAfter?: { energy: number; influence: number; info: number };
  /** Signed resource effect applied after the action outcome. */
  yieldsApplied?: { influence?: number; info?: number };
  narrative?: string;
}

export type IncomingInteractionType =
  | 'compliment'
  | 'gossip'
  | 'warning'
  | 'alliance_proposal'
  | 'deal_offer'
  | 'nomination_plea'
  | 'check_in'
  | 'snide_remark'
  | 'other';

export type IncomingInteractionResponseType =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'accept'
  | 'decline'
  | 'dismiss'
  | 'ignore';

export type IncomingInteractionPriority = 'high' | 'medium' | 'low';

/** A concrete future action the player promised during an incoming interaction. */
export type SocialCommitmentKind =
  | 'protect_from_nomination'
  | 'use_safety_on_player'
  | 'vote_to_keep';

export type SocialCommitmentStatus = 'pending' | 'kept' | 'broken' | 'void';

/** A dialogue promise that later game actions can objectively verify. */
export interface SocialCommitment {
  id: string;
  interactionId: string;
  kind: SocialCommitmentKind;
  promisorId: string;
  beneficiaryId: string;
  createdWeek: number;
  dueWeek: number;
  status: SocialCommitmentStatus;
  resolvedAt?: number;
  resolvedWeek?: number;
  resolutionReason?: string;
}

export type IncomingInteractionDecisionStage =
  | 'generation'
  | 'scheduling'
  | 'delivery'
  | 'postponed'
  | 'deduped'
  | 'dropped'
  | 'expiration'
  | 'auto_resolution';

export interface IncomingInteraction {
  id: string;
  fromId: string;
  type: IncomingInteractionType;
  text: string;
  payload?: Record<string, unknown>;
  createdAt: number;
  createdWeek: number;
  expiresAtWeek: number;
  read: boolean;
  requiresResponse: boolean;
  resolved: boolean;
  resolvedAt?: number;
  resolvedWeek?: number;
  resolvedWith?: IncomingInteractionResponseType;
  resolvedLabel?: string;
  outcomeText?: string;
}

export interface ScheduledIncomingInteraction {
  interaction: IncomingInteraction;
  scheduledForPhase?: string;
  scheduledForWeek?: number;
  priority: IncomingInteractionPriority;
  scheduledAt: number;
  deliveryReason?: string;
}

export interface IncomingInteractionDecisionLogEntry {
  id: string;
  stage: IncomingInteractionDecisionStage;
  reason: string;
  timestamp: number;
  interactionId?: string;
  actorId?: string;
  type?: IncomingInteractionType;
  priority?: IncomingInteractionPriority;
  week?: number;
  phase?: string;
  scheduledForWeek?: number;
  scheduledForPhase?: string;
  detail?: string;
}

export interface IncomingInteractionDeliveryState {
  lastDeliveryPhase?: string | null;
  lastDeliveryWeek?: number | null;
  deliveredThisPhase: number;
}

/** Redux-serialisable state subtree owned by the social module. */
export interface SocialState {
  energyBank: SocialEnergyBank;
  /** Influence resource bank per player (🤝). */
  influenceBank: SocialEnergyBank;
  /** Info resource bank per player (💡). */
  infoBank: SocialEnergyBank;
  relationships: RelationshipsMap;
  lastReport?: SocialPhaseReport | null;
  /** Actions executed during the currently open Social panel session. */
  sessionLogs: SocialActionLogEntry[];
  /** Bounded gameplay history retained after the panel closes. */
  actionHistory?: SocialActionLogEntry[];
  /** Schema version used by backward-compatible social save migration. */
  socialStateVersion?: number;
  /** Incoming social interactions awaiting the player. */
  incomingInteractions: IncomingInteraction[];
  /** Decision log entries for incoming interaction scheduling/debugging. */
  incomingInteractionLogs: IncomingInteractionDecisionLogEntry[];
  /** Scheduled incoming interactions waiting for a delivery window. */
  scheduledIncomingInteractions: ScheduledIncomingInteraction[];
  /** Delivery counters for incoming interaction scheduling. */
  incomingInteractionDelivery: IncomingInteractionDeliveryState;
  /** Directed social memory entries keyed by actor → target. */
  socialMemory: SocialMemoryMap;
  /** Promises made through incoming interactions and their eventual outcomes. */
  commitments: SocialCommitment[];
  /** Persistent premium arcs, rumours, beliefs and paced public events. */
  dramaNetwork: DramaSocialNetwork;
  /**
   * Influence weights per actor and decision type: actorId → decisionType → (targetId → weight).
   * Populated by SocialInfluence.update dispatching social/influenceUpdated.
   */
  influenceWeights: Record<string, Record<string, Record<string, number>>>;
  /**
   * Whether the social panel has been manually opened by the player (e.g. via the FAB).
   * When true the panel is visible regardless of the current game phase.
   */
  panelOpen: boolean;
  /**
   * Snapshot of affinity values taken at the start of each week (when transitioning to
   * `week_start`). Used to compute the week-over-week relationship trend arrow shown in
   * the expanded PlayerCard.  Shape: actorId → targetId → affinity.
   */
  weekStartRelSnapshot: Record<string, Record<string, number>>;
  /** Whether the incoming interactions inbox panel is open. */
  incomingInboxOpen: boolean;
}

// ── Policy ────────────────────────────────────────────────────────────────

/** Context passed to SocialPolicy functions. */
export interface PolicyContext {
  relationships: RelationshipsMap;
  players: Array<{ id: string; status: string; isUser?: boolean }>;
  week?: number;
  seed?: number;
}
