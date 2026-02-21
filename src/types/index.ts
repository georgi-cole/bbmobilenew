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

// Game phases map 1-to-1 with bbmobile phases for portability
export type Phase =
  | 'lobby'
  | 'opening'
  | 'intermission'
  | 'hoh'
  | 'nominations'
  | 'veto_comp'
  | 'veto_ceremony'
  | 'livevote'
  | 'jury'
  | 'final3_comp1'
  | 'final3_comp2'
  | 'final3_decision'
  | 'social';

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
