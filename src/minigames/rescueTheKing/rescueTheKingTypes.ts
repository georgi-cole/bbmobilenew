/**
 * rescueTheKingTypes.ts
 * 
 * TypeScript types and constants for the Rescue the King match-3 minigame.
 */

// ── Tile types ─────────────────────────────────────────────────────────────────

export type TileSymbol = 'gem' | 'sword' | 'shield' | 'crown' | 'potion';

export type BlockerKind = 'crate' | 'stone'; // crate=1hit, stone=2hit

export interface NormalCell {
  kind: 'normal';
  symbol: TileSymbol;
}

export interface BlockerCell {
  kind: 'blocker';
  blockerKind: BlockerKind;
  hitsRemaining: number; // starts at 1 for crate, 2 for stone
}

export interface EmptyCell {
  kind: 'empty';
}

export type Cell = NormalCell | BlockerCell | EmptyCell;

export type Board = Cell[][];

// ── Game phase ────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'idle'       // Before game starts
  | 'playing'    // Active gameplay, waiting for player input
  | 'animating'  // Resolving matches / gravity (no input allowed)
  | 'win'        // Board cleared
  | 'lose';      // Timer expired

// ── Level definition ──────────────────────────────────────────────────────────

export interface LevelConfig {
  id: number;
  name: string;
  rows: number;
  cols: number;
  /**
   * Grid of blocker placements. '' = normal tile, 'X' = 1-hit crate, 'W' = 2-hit stone.
   * Row 0 is the top. Must be [rows][cols].
   */
  blockerLayout: string[][];
  /** Deterministic RNG seed for symbol placement. */
  seed: number;
}

// ── Game state ────────────────────────────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  board: Board;
  score: number;
  tilesCleared: number;
  blockersHit: number;
  blockersDestroyed: number;
  currentCombo: number;
  maxCombo: number;
  timeRemainingMs: number;
  totalTimeMs: number;
  selectedCell: [number, number] | null;
  reshuffleCount: number;
  initialNormalTileCount: number;
  boardCleared: boolean;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export const SYMBOLS: TileSymbol[] = ['gem', 'sword', 'shield', 'crown', 'potion'];

export const SYMBOL_EMOJI: Record<TileSymbol, string> = {
  gem: '💎',
  sword: '⚔️',
  shield: '🛡️',
  crown: '👑',
  potion: '🧪',
};

export const SYMBOL_COLOR: Record<TileSymbol, string> = {
  gem:    '#4fc3f7',
  sword:  '#ef9a9a',
  shield: '#a5d6a7',
  crown:  '#fff176',
  potion: '#ce93d8',
};
