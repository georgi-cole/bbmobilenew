// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for bbmobilenew
// Add new fields here; consumers only break if they depend on removed fields.
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerStatus =
  | 'active'
  | 'nominated'
  | 'hoh'
  | 'pov'
  | 'hoh+pov'
  | 'nominated+pov'
  | 'evicted'
  | 'jury';

export interface Player {
  id: string;
  name: string;
  /** Emoji or URL used as avatar face */
  avatar: string;
  status: PlayerStatus;
  isUser?: boolean;
  stats?: {
    hohWins: number;
    povWins: number;
    timesNominated: number;
  };
}

// Canonical weekly-game phase list (in execution order)
export type Phase =
  | 'week_start'
  | 'hoh_comp'
  | 'hoh_results'
  | 'social_1'
  | 'nominations'
  | 'nomination_results'
  | 'pov_comp'
  | 'pov_results'
  | 'pov_ceremony'
  | 'pov_ceremony_results'
  | 'social_2'
  | 'live_vote'
  | 'eviction_results'
  | 'week_end'
  /** Special: entered from pov_results when aliveCount === 4 (skips ceremony). */
  | 'final4_eviction'
  /** Special: entered after Final 4 eviction; announces the Final 3. */
  | 'final3'
  /** Final 3 Part 1: all 3 houseguests compete; winner advances to Part 3. */
  | 'final3_comp1'
  /** Final 3 Part 2: the 2 Part-1 losers compete; winner advances to Part 3. */
  | 'final3_comp2'
  /** Final 3 Part 3: Part-1 winner vs Part-2 winner → Final HOH crowned. */
  | 'final3_comp3'
  /** Final HOH evicts one of the 2 remaining houseguests directly (no vote). */
  | 'final3_decision';

export interface TvEvent {
  id: string;
  text: string;
  type: 'game' | 'social' | 'vote' | 'twist' | 'diary';
  timestamp: number;
}

export interface GameState {
  season: number;
  week: number;
  phase: Phase;
  players: Player[];
  tvFeed: TvEvent[];
  isLive: boolean;
  /** Mulberry32 seed – advances on each outcome computation for reproducibility. */
  seed: number;
  /** Player ID of the current Head of Household, or null between weeks. */
  hohId: string | null;
  /** Player IDs currently nominated for eviction. */
  nomineeIds: string[];
  /** Player ID of the current Power of Veto holder, or null. */
  povWinnerId: string | null;
  /**
   * When true, the human HOH must pick a replacement nominee (after a POV auto-save).
   * The Continue button is hidden and a replacement picker is shown instead.
   */
  replacementNeeded?: boolean;
  /**
   * When true, the human Final HOH must directly evict one of the 2 remaining
   * houseguests in the `final3_decision` phase.
   * The Continue button is hidden and a TvDecisionModal is shown instead.
   */
  awaitingFinal3Eviction?: boolean;
  /**
   * Winner of Final 3 Part 1 — advances directly to Part 3 (skips Part 2).
   * Set during `final3_comp1` advance.
   */
  f3Part1WinnerId?: string | null;
  /**
   * Winner of Final 3 Part 2 — advances to Part 3 to face the Part 1 winner.
   * Set during `final3_comp2` advance.
   */
  f3Part2WinnerId?: string | null;
  /** Optional weekly config overrides. */
  cfg?: {
    /** When true, special POV twists and Final4 bypass are suspended. */
    multiEviction?: boolean;
  };
}

// ─── Status pill ─────────────────────────────────────────────────────────────
/** Visual variants available for <StatusPill> */
export type StatusPillVariant =
  | 'phase'
  | 'week'
  | 'players'
  | 'dr'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral';
