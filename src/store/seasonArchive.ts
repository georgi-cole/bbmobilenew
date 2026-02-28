// ─── Season Archive Types ─────────────────────────────────────────────────────

/**
 * Per-player summary captured at the end of a season.
 */
export interface PlayerSeasonSummary {
  playerId: string;
  displayName: string;
  /** Null means explicitly no placement (e.g. evicted pre-jury). Undefined means not yet determined. */
  finalPlacement?: number | null;
  compsWon?: number;
  noms?: number;
  leaderboardScore?: number;
  isEvicted?: boolean;
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
}
