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
  | 'lose';      // Timer expired or board deadlocked

/** Distinguishes why the game ended in a loss. */
export type LoseReason = 'timeout' | 'deadlock';

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
  /**
   * Optional explicit symbol layout. When provided, the symbol at [r][c] is used
   * directly instead of the RNG — enabling fully deterministic, hand-validated boards.
   * Valid values: 'gem' | 'sword' | 'shield' | 'crown' | 'potion'
   * Leave a cell as '' to fall back to the seeded RNG for that position.
   * Cells that match a blocker in blockerLayout are ignored.
   *
   * Solvability is guaranteed when tileLayout is designed such that
   * hasAnyValidMove() returns true on the resulting board.  Use validateLevel()
   * in rescueTheKingLogic.ts to verify before shipping a level.
   */
  tileLayout?: (TileSymbol | '')[][];
  /** Deterministic RNG seed for symbol placement (used when tileLayout is absent or has '' cells). */
  seed: number;
  /**
   * Target positions for the win condition.
   *
   * Each entry is a [row, col] pair whose cell must be cleared (emptied) for the
   * player to win.  Typically these are the blocker positions — the player wins
   * when all target blockers have been destroyed.
   *
   * If omitted or empty, the win condition falls back to clearing ALL normal tiles
   * from the board (original behaviour).
   *
   * Design rationale:
   * - Using explicit targets avoids the "infinite refill" contradiction: with a
   *   finite board and target-based win, the board can truly empty.
   * - Targets are always breakable via the standard blocker-hit mechanic; there
   *   is no "unbreakable" row problem.
   */
  targetPositions?: [number, number][];
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
  /**
   * Number of target positions at board construction time.
   * 0 when the level has no targetPositions (fallback to clear-all-tiles win).
   * Used to render the progress bar and result screen.
   */
  initialTargetCount: number;
  boardCleared: boolean;
  loseReason: LoseReason | null;
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
