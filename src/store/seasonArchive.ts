// ─── Season Archive Types ─────────────────────────────────────────────────────

/**
 * Per-player summary captured at the end of a season.
 * Raw boolean/integer fields are populated by GameOver.buildArchive().
 * `leaderboardScore` is computed from these fields using the scoring module.
 */
export interface PlayerSeasonSummary {
  playerId: string;
  displayName: string;
  /** Null means explicitly no placement (e.g. evicted pre-jury). Undefined means not yet determined. */
  finalPlacement?: number | null;
  /** Number of HOH competitions won this season. */
  hohWins?: number;
  /** Number of POV competitions won this season. */
  povWins?: number;
  /** Total comps won (HOH + POV); kept for backward compatibility. */
  compsWon?: number;
  /** Number of times the player was nominated for eviction. */
  timesNominated?: number;
  /** @deprecated Use timesNominated */
  noms?: number;
  /** True if the player made the jury (status 'jury' at season end). */
  madeJury?: boolean;
  /** Number of Battle Back competitions won (returned to house after eviction). */
  battleBackWins?: number;
  /** True if the player survived a double eviction week (two evictions in one week). */
  survivedDoubleEviction?: boolean;
  /** True if the player survived a triple eviction week (three evictions in one week). */
  survivedTripleEviction?: boolean;
  /** True if the player won the Public's Favorite Player vote. */
  wonPublicFavorite?: boolean;
  /** True if the player won the Final HOH (Part 3 of the Final 3 competition). */
  wonFinalHoh?: boolean;
  /** Number of weeks the player remained in the house (alive). */
  weeksAlive?: number;
  /** True if the player was evicted at some point (including jury). */
  isEvicted?: boolean;
  /** Computed total leaderboard score using the scoring module weights. */
  leaderboardScore?: number;
}

/**
 * Compact record of one completed season stored in Redux (and optionally
 * persisted to localStorage / future server backend).
 */
export interface SeasonArchive {
  /** 1-based season number. */
  seasonIndex: number;
  /** UUID or timestamp-derived unique identifier for this season. */
  seasonId: string;
  /** ISO timestamp when the season started (optional). */
  startAt?: string;
  /** ISO timestamp when the season ended (optional). */
  endAt?: string;
  /** Optional human-readable season summary text. */
  summaryText?: string;
  /** Per-player results. */
  playerSummaries: PlayerSeasonSummary[];
  /** Any rewards / achievements earned this season. */
  rewardsEarned?: string[];
  /**
   * Week numbers where a double eviction occurred (2 players evicted in one week).
   * Used to award survivedDoubleEviction points to players who survived those weeks.
   */
  doubleEvictionWeeks?: number[];
  /**
   * Week numbers where a triple eviction occurred (3 players evicted in one week).
   */
  tripleEvictionWeeks?: number[];
}
