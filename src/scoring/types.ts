// ─── Scoring types ─────────────────────────────────────────────────────────────

/**
 * Configurable weights for each scoring event.
 * All values are integer point awards per occurrence (or per boolean true).
 * Pass a partial override to `mergeWeights` to customise without replacing defaults.
 */
export interface ScoringWeights {
  /** Points per HOH competition won. */
  perHohWin: number;
  /** Points per POV competition won. */
  perPovWin: number;
  /** Points awarded for reaching jury status. */
  madeJury: number;
  /** Points per Battle Back competition won (returned after eviction). */
  perBattleBackWin: number;
  /** Points for surviving a double eviction week. */
  survivedDoubleEviction: number;
  /** Points for surviving a triple eviction week. */
  survivedTripleEviction: number;
  /** Points for winning the Public's Favorite Player vote. */
  wonPublicFavorite: number;
  /** Points for winning the season (final placement = 1). */
  wonGame: number;
  /**
   * Combined award when the same player wins both the game AND the
   * Public's Favorite Player vote.  Replaces (wonGame + wonPublicFavorite)
   * when both conditions are true.
   */
  wonBothGameAndFavorite: number;
  /** Points for winning the Final HOH (Part 3 of the Final 3 competition). */
  wonFinalHoh: number;
  /** Points for reaching runner-up (final placement = 2). */
  runnerUp: number;
}

/**
 * Per-event point breakdown for a single player in a single season.
 * Each field matches a `ScoringWeights` key (or is a derived combination).
 * Useful for rendering a "how did you score?" breakdown in the UI.
 */
export interface ScoreBreakdown {
  hohWins: number;
  povWins: number;
  madeJury: number;
  battleBackWins: number;
  survivedDoubleEviction: number;
  survivedTripleEviction: number;
  wonPublicFavorite: number;
  /** Points from winning the game OR the wonBothGameAndFavorite bonus. */
  winBonus: number;
  wonFinalHoh: number;
  runnerUp: number;
  /** Computed grand total of all categories above. */
  total: number;
}
