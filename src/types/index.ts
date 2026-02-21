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
  | 'week_end';

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
