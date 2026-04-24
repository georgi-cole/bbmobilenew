import { describe, expect, it } from 'vitest';
import { getGame, getPoolByFilter } from '../../src/minigames/registry';

const RETIRED_GAME_KEYS = [
  'countHouse',
  'triviaPulse',
  'wordAnagram',
  'laneRacers',
  'tiltedLedge',
  'rainBarrelBalance',
  'memoryZipline',
  'swipeMaze',
  'socialStrings',
  'flashFlood',
  'gridLock',
  'keyMaster',
  'laserPantryDash',
  'confettiCannon',
  'buzzerSprintRelay',
] as const;

describe('minigame registry retirement', () => {
  it('marks deprecated and removed minigames as retired', () => {
    for (const key of RETIRED_GAME_KEYS) {
      expect(getGame(key)?.retired, `${key} should be retired`).toBe(true);
    }
  });

  it('excludes retired minigames from the active game pool', () => {
    const activeKeys = new Set(getPoolByFilter({ retired: false }).map((game) => game.key));

    for (const key of RETIRED_GAME_KEYS) {
      expect(activeKeys.has(key), `${key} should not be in the active pool`).toBe(false);
    }
  });

  it('keeps retired minigames available in the retired pool for manual/debug selection', () => {
    const retiredKeys = new Set(getPoolByFilter({ retired: true }).map((game) => game.key));

    for (const key of RETIRED_GAME_KEYS) {
      expect(retiredKeys.has(key), `${key} should be in the retired pool`).toBe(true);
    }
  });
});
