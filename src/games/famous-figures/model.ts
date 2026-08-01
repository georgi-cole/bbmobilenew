/**
 * Domain types for the "Famous Figures" minigame.
 */

// â”€â”€â”€ Figure data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type FigureDifficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard'

export interface FigureRow {
  canonicalName: string
  /** Pre-normalised canonical name (particles removed, lowercase, no diacritics). */
  normalizedName: string
  acceptedAliases: string[]
  /** Pre-normalised aliases (same transformation as normalizedName). */
  normalizedAliases: string[]
  /** Exactly 5 hints, from vague â†’ specific. */
  hints: [string, string, string, string, string]
  /** Single-sentence clue shown before any hints are requested. */
  baseClueFact: string
  /** Internal recognizability band used only for AI accuracy and response timing. */
  difficulty: FigureDifficulty
  category: string
  era: string
}

/**
 * The first curated follow-up hint is deliberately omitted from play. It
 * commonly repeats the broad setup clue without adding useful information.
 */
export const VISIBLE_HINT_INDICES = [1, 2, 3, 4] as const
export const MAX_VISIBLE_HINTS = VISIBLE_HINT_INDICES.length

// â”€â”€â”€ Game state enums / unions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type HintStage =
  | 'clue'
  | 'hint_1'
  | 'hint_2'
  | 'hint_3'
  | 'hint_4'
  | 'hint_5'
  | 'overtime'
  | 'done'

export type RoundPhase = 'round_active' | 'round_reveal'

export type MatchStatus = 'idle' | 'round_active' | 'round_reveal' | 'complete'

// â”€â”€â”€ Per-player state (embedded in FamousFiguresState) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface PlayerState {
  score: number
  roundScores: number[]
  correctThisRound: boolean
  guesses: string[]
}

