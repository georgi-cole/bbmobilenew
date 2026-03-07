/**
 * Domain types for the "Famous Figures" minigame.
 */

// ─── Figure data ─────────────────────────────────────────────────────────────

export interface FigureRow {
  canonicalName: string;
  /** Pre-normalised canonical name (particles removed, lowercase, no diacritics). */
  normalizedName: string;
  acceptedAliases: string[];
  /** Pre-normalised aliases (same transformation as normalizedName). */
  normalizedAliases: string[];
  /** Exactly 5 hints, from vague → specific. */
  hints: [string, string, string, string, string];
  /** Single-sentence clue shown before any hints are requested. */
  baseClueFact: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  era: string;
}

// ─── Game state enums / unions ────────────────────────────────────────────────

export type HintStage =
  | 'clue'
  | 'hint_1'
  | 'hint_2'
  | 'hint_3'
  | 'hint_4'
  | 'hint_5'
  | 'overtime'
  | 'done';

export type RoundPhase = 'round_active' | 'round_reveal';

export type MatchStatus = 'idle' | 'round_active' | 'round_reveal' | 'complete';

// ─── Per-player state (embedded in FamousFiguresState) ───────────────────────

export interface PlayerState {
  score: number;
  roundScores: number[];
  correctThisRound: boolean;
  guesses: string[];
}
