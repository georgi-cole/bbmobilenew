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

/** Redux-serialisable state subtree owned by the social module. */
export interface SocialState {
  energyBank: SocialEnergyBank;
  relationships: RelationshipsMap;
  lastReport?: SocialPhaseReport | null;
  /** Raw event log entries; typed as `unknown` until engine types are defined. */
  sessionLogs: unknown[];
  /**
   * Latest influence weights per actor: actorId → (targetId → weight).
   * Populated by SocialInfluence.update dispatching social/influenceUpdated.
   */
  influenceWeights: Record<string, Record<string, number>>;
}

// ── Policy ────────────────────────────────────────────────────────────────

/** Context passed to SocialPolicy functions. */
export interface PolicyContext {
  relationships: RelationshipsMap;
  players: Array<{ id: string; status: string; isUser?: boolean }>;
  week?: number;
  seed?: number;
}
