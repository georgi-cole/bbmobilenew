import type { GameMode } from './modeTypes';

export type LegacyGameMode = GameMode | 'survivor';

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
  socialModeEnabled: true,
  competitionsEnabled: true,
  nominationEvictionEnabled: true,
  infiniteDaysEnabled: true,
  replaceEvictedPlayers: true,
  useRoboPlayers: true,
};

export function normalizeGameMode(mode: LegacyGameMode | undefined | null): GameMode {
  return mode === 'survival' || mode === 'survivor' ? 'survival' : 'classic';
}

export function getModeConfig(mode: LegacyGameMode | undefined | null): GameModeConfig {
  return normalizeGameMode(mode) === 'survival' ? survivorModeConfig : classicModeConfig;
}

export function isPublicModeEnabled(mode: LegacyGameMode | undefined | null): boolean {
  return getModeConfig(mode).publicModeEnabled;
}

export function isSocialModeEnabled(mode: LegacyGameMode | undefined | null): boolean {
  return getModeConfig(mode).socialModeEnabled;
}

export function isInfiniteMode(mode: LegacyGameMode | undefined | null): boolean {
  return getModeConfig(mode).infiniteDaysEnabled;
}

export function shouldReplaceEvictedPlayers(mode: LegacyGameMode | undefined | null): boolean {
  return getModeConfig(mode).replaceEvictedPlayers;
}
