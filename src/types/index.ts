// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for bbmobilenew
// Add new fields here; consumers only break if they depend on removed fields.
// ─────────────────────────────────────────────────────────────────────────────

import type { SocialState } from '../social/types';

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
    /** Personal-record tap count for TapRace competitions. */
    tapRacePR?: number;
    /** Per-game personal-record scores keyed by game key (raw rounded score reported by the game). */
    gamePRs?: Record<string, number>;
  };
  /** Set to 1 for the winner, 2 for runner-up after finale. */
  finalRank?: number;
  /** True once the player is confirmed season winner. */
  isWinner?: boolean;
}

// ─── Minigame types ───────────────────────────────────────────────────────────

/** Authoritative result of a completed minigame. Scores are raw tap counts. */
export interface MinigameResult {
  seedUsed: number;
  /** Raw scores keyed by player ID. Higher = better for TapRace. */
  scores: Record<string, number>;
  winnerId: string;
  /** Players whose score beat their previous personal record this run. */
  personalRecords?: Record<string, number>;
}

/** Active minigame session stored in game state while waiting for player input. */
export interface MinigameSession {
  key: string;
  participants: string[];
  seed: number;
  options: { timeLimit: number };
  /** Pre-simulated deterministic scores for every non-human participant. */
  aiScores: Record<string, number>;
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
  | 'final3_decision'
  /** Jury phase: the Final 2 faces the jury for votes; finale overlay active. */
  | 'jury';

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
  /**
   * Player ID of the outgoing (previous week's) Head of Household.
   * Set at the start of each new week so the outgoing HOH can be excluded
   * from the HOH competition. Null in Week 1 and during the Final 3.
   */
  prevHohId: string | null;
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
   * When true, the human HOH must pick two nominees in the `nomination_results` phase.
   * The Continue button is hidden and a two-step nominee picker is shown instead.
   */
  awaitingNominations?: boolean;
  /**
   * The first nominee chosen by the human HOH during the two-step nomination flow.
   * Set by `selectNominee1`; cleared after `finalizeNominations`.
   */
  pendingNominee1Id?: string | null;
  /**
   * When true, the human POV holder must decide whether to use the veto
   * in the `pov_ceremony_results` phase (not applicable when they are a nominee,
   * since nominees always self-save).
   * The Continue button is hidden and a Yes/No binary modal is shown.
   */
  awaitingPovDecision?: boolean;
  /**
   * When true, the human POV holder chose to use the veto and must now pick
   * which nominee to save. The Continue button is hidden and a player picker
   * showing current nominees is rendered.
   */
  awaitingPovSaveTarget?: boolean;
  /**
   * Vote accumulator for the live eviction vote.
   * Maps voter player ID → nominee player ID.
   * Populated during `live_vote` transition (AI votes) and by `submitHumanVote`.
   */
  votes?: Record<string, string>;
  /**
   * When true, the human player is an eligible voter during `live_vote` and must
   * cast their eviction vote via a blocking modal before `advance()` continues.
   */
  awaitingHumanVote?: boolean;
  /**
   * When true, the live vote ended in a tie and the human HOH must break it.
   * The Continue button is hidden and a tie-break modal is shown.
   */
  awaitingTieBreak?: boolean;
  /**
   * The subset of nominees that are tied in the live eviction vote.
   * Populated when `awaitingTieBreak` is set; shown in the tie-break modal.
   */
  tiedNomineeIds?: string[] | null;
  /**
   * When true, the human Final HOH must directly evict one of the 2 remaining
   * houseguests in the `final3_decision` phase.
   * The Continue button is hidden and a TvDecisionModal is shown instead.
   */
  awaitingFinal3Eviction?: boolean;
  /**
   * Active minigame session. Set when the human player needs to play a
   * minigame (e.g. TapRace for HOH/POV). The Continue button is hidden and
   * the TapRace overlay is shown instead. Null when no minigame is active.
   */
  pendingMinigame?: MinigameSession | null;
  /**
   * Result of the most-recently completed minigame. Used by `advance()` to
   * determine the HOH/POV winner instead of a random pick. Cleared after use.
   */
  minigameResult?: MinigameResult | null;
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
  /**
   * When truthy, a TWIST is active and the TWIST pill will be shown in the TvZone header.
   * Set this field in game logic when a twist is introduced.
   */
  twistActive?: boolean;
  /** Social subsystem state (always-on; initialised from SOCIAL_INITIAL_STATE). */
  social?: SocialState;
  /** Optional weekly config overrides. */
  cfg?: {
    /**
     * Future feature flag for multi-eviction weeks.
     * When true, special POV twists may be suspended.
     * NOTE: Final 4 special handling (POV holder sole vote) is always enforced
     * regardless of this flag. There is currently no automatic logic to set
     * this flag; it is a placeholder for future multi-eviction week support.
     */
    multiEviction?: boolean;
    /**
     * Number of jury members (default 7).
     * Formula: nonJuryEvictions = totalPlayers - 2 - jurySize;
     * players evicted at index < nonJuryEvictions go home (status 'evicted'),
     * the rest become jurors (status 'jury').
     */
    jurySize?: number;
    /**
     * When true, one pre-jury evictee may return to the jury house via
     * jury-return scoring before voting begins.
     */
    enableJuryReturn?: boolean;
    /**
     * Total pacing budget (ms) for the full jury-reveal sequence.
     * Default: 42 000 (42 s).  Tests should use a much shorter value.
     */
    tJuryFinale?: number;
    /**
     * Per-vote reveal delay (ms).
     * Default: derived from tJuryFinale / jurySize.
     */
    tVoteReveal?: number;
    /**
     * When true, a tied vote is broken by "America's Vote" (random pick).
     * Default false – ties are broken deterministically via seeded RNG.
     */
    americasVoteEnabled?: boolean;
  };
}

// ─── Status pill ─────────────────────────────────────────────────────────────
/** Visual variants available for <StatusPill> */
export type StatusPillVariant =
  | 'phase'
  | 'week'
  | 'players'
  | 'dr'
  | 'twist'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral';
