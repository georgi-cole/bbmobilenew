import type { GameState as BaseGameState, Player as BasePlayer } from '../types';

export type GameMode = 'classic' | 'survival';
export type SeasonExpansionMode = 'cupidArrow' | 'voxPopuli';
export type SeasonRuleset = 'classic' | SeasonExpansionMode;
export type SeasonSelectionMethod = 'direct' | 'surprise';
export type GameRunStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface ClassicModeState {
  kind: 'classic';
}

export interface SurvivorModeState {
  kind: 'survival';
  currentDay: number;
  totalRoboContestantsEvicted: number;
  bestDayReached: number;
  startingCastSize: number;
  nextRoboIndex: number;
  replacementTransition?: SurvivorReplacementTransition | null;
  competitionRotation: {
    usedKeys: string[];
    round: number;
  };
}

export interface SurvivorReplacementTransition {
  mode: 'survival';
  outgoingPlayerSnapshot: BasePlayer;
  incomingPlayerId: string;
  slot: number;
  startedAt: number;
  durationMs: number;
}

export type ModeSpecificState = ClassicModeState | SurvivorModeState;

export type GameRunState = BaseGameState & {
  runId?: string;
  mode?: GameMode;
  status?: GameRunStatus;
  modeSpecific?: ModeSpecificState;
  createdAt?: number;
  lastPlayedAt?: number;
  saveVersion?: number;
};

export type RoboPlayer = BasePlayer & {
  isRobo?: boolean;
  survivorEntryDay?: number;
  survivorSlot?: number;
};

declare module '../types' {
  interface Player {
    isRobo?: boolean;
    survivorEntryDay?: number;
    survivorSlot?: number;
  }

  interface GameState {
    runId?: string;
    mode?: GameMode;
    status?: GameRunStatus;
    modeSpecific?: ModeSpecificState;
    createdAt?: number;
    lastPlayedAt?: number;
    saveVersion?: number;
    /** Finite-season ruleset. Classic is represented by null; paid rulesets are locked at season start. */
    expansionMode?: SeasonExpansionMode | null;
    /** Persisted so a Surprise Me season never rerolls on reload or profile switching. */
    seasonSelectionMethod?: SeasonSelectionMethod;
  }
}
