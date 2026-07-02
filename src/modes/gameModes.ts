import type { GameMode } from './modeTypes';

export interface GameModeConfig {
  publicModeEnabled: boolean;
  socialModeEnabled: boolean;
  competitionsEnabled: boolean;
  nominationEvictionEnabled: boolean;
  infiniteDaysEnabled: boolean;
  replaceEvictedPlayers: boolean;
  useRoboPlayers: boolean;
}

export const classicModeConfig: GameModeConfig = {
  publicModeEnabled: true,
  socialModeEnabled: true,
  competitionsEnabled: true,
  nominationEvictionEnabled: true,
  infiniteDaysEnabled: false,
  replaceEvictedPlayers: false,
  useRoboPlayers: false,
};

export const survivorModeConfig: GameModeConfig = {
  publicModeEnabled: false,
  socialModeEnabled: false,
  competitionsEnabled: true,
  nominationEvictionEnabled: true,
  infiniteDaysEnabled: true,
  replaceEvictedPlayers: true,
  useRoboPlayers: true,
};

export function normalizeGameMode(mode: GameMode | undefined | null): GameMode {
  return mode === 'survivor' ? 'survivor' : 'classic';
}

export function getModeConfig(mode: GameMode | undefined | null): GameModeConfig {
  return normalizeGameMode(mode) === 'survivor' ? survivorModeConfig : classicModeConfig;
}

export function isPublicModeEnabled(mode: GameMode | undefined | null): boolean {
  return getModeConfig(mode).publicModeEnabled;
}

export function isSocialModeEnabled(mode: GameMode | undefined | null): boolean {
  return getModeConfig(mode).socialModeEnabled;
}

export function isInfiniteMode(mode: GameMode | undefined | null): boolean {
  return getModeConfig(mode).infiniteDaysEnabled;
}

export function shouldReplaceEvictedPlayers(mode: GameMode | undefined | null): boolean {
  return getModeConfig(mode).replaceEvictedPlayers;
}
