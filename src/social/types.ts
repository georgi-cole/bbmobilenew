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
  cost: number;
  delta: number;
  outcome: 'success' | 'failure';
  newEnergy: number;
  timestamp: number;
  /** Normalised outcome score in [-1, +1] produced by the SocialPolicy evaluator. */
  score?: number;
  /** Human-readable outcome label (e.g. 'Good', 'Bad') produced by the evaluator. */
  label?: string;
}

/** Redux-serialisable state subtree owned by the social module. */
export interface SocialState {
  energyBank: SocialEnergyBank;
  relationships: RelationshipsMap;
  lastReport?: SocialPhaseReport | null;
  /** Append-only log of social actions executed this session. */
  sessionLogs: SocialActionLogEntry[];
  /**
   * Influence weights per actor and decision type: actorId → decisionType → (targetId → weight).
   * Populated by SocialInfluence.update dispatching social/influenceUpdated.
   */
  influenceWeights: Record<string, Record<string, Record<string, number>>>;
}

// ── Policy ────────────────────────────────────────────────────────────────

/** Context passed to SocialPolicy functions. */
export interface PolicyContext {
  relationships: RelationshipsMap;
  players: Array<{ id: string; status: string; isUser?: boolean }>;
  week?: number;
  seed?: number;
}
