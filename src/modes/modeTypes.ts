import type { GameState as BaseGameState, Player as BasePlayer } from '../types';

export type GameMode = 'classic' | 'survivor';
export type GameRunStatus = 'active' | 'paused' | 'completed' | 'failed';

export interface ClassicModeState {
  kind: 'classic';
}

export interface SurvivorModeState {
  kind: 'survivor';
  currentDay: number;
  totalRoboContestantsEvicted: number;
  bestDayReached: number;
  startingCastSize: number;
  nextRoboIndex: number;
  competitionRotation: {
    usedKeys: string[];
    round: number;
  };
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
  }
}
