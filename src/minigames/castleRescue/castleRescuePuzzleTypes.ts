export type GemColor = 'ruby' | 'emerald' | 'sapphire';

export interface Position {
  row: number;
  col: number;
}

export interface GemTile {
  kind: 'gem';
  id: string;
  color: GemColor;
}

export interface BlockerTile {
  kind: 'blocker';
  id: string;
  strength: 1 | 2;
}

export interface VoidTile {
  kind: 'void';
}

export type Tile = GemTile | BlockerTile;
export type BoardCell = Tile | VoidTile | null;
export type PuzzleBoard = BoardCell[][];

export interface MatchGroup {
  color: GemColor;
  cells: Position[];
}

export interface MoveCandidate {
  from: Position;
  to: Position;
  immediateMatchCount: number;
}

export interface ResolutionStep {
  cascadeIndex: number;
  matched: Position[];
  removedGemCount: number;
  blockerHits: Array<{ position: Position; damage: 1; destroyed: boolean }>;
  resultingBoard: PuzzleBoard;
}

export interface ResolutionResult {
  board: PuzzleBoard;
  steps: ResolutionStep[];
}

export interface CastleRescueLevelDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  rows: string[];
  summary: string;
  blockerDensity: 'none' | 'light' | 'medium';
}
