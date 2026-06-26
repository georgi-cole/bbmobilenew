import { describe, expect, it } from 'vitest';

import reactComponents from '../src/minigames/reactComponents';
import { getAllGames, getGame, getPoolByFilter } from '../src/minigames/registry';

const VALID_SCORING_ADAPTERS = new Set([
  'raw',
  'rankPoints',
  'timeToPoints',
  'lowerBetter',
  'binary',
  'authoritative',
]);

const VALID_CATEGORIES = new Set(['arcade', 'endurance', 'logic', 'trivia']);
const VALID_METRIC_KINDS = new Set(['count', 'time', 'accuracy', 'endurance', 'hybrid', 'points']);
const SPECIAL_CASE_COMPONENT_KEYS = new Set([
  'ClosestWithoutGoingOver',
  'HoldTheWall',
  'BiographyBlitz',
  'FamousFigures',
  'SilentSaboteur',
  'MajorityRules',
  'GlassBridge',
  'CrystalPathShattered',
  'BlackjackTournament',
  'RiskWheel',
  'WildcardWestern',
  'CodeBreaker',
  'Tetris',
  'ColorMatch',
  'Capitalization',
  'MemoryColors',
  'TrapAuction',
  'TiltLabyrinth',
]);

describe('minigame registry audit', () => {
  it('keeps every registry key unique', () => {
    const allGames = getAllGames();
    const keys = allGames.map((game) => game.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps the active pool free of retired entries', () => {
    const activeKeys = new Set(getPoolByFilter({ retired: false }).map((game) => game.key));
    const retiredKeys = getPoolByFilter({ retired: true }).map((game) => game.key);

    for (const key of retiredKeys) {
      expect(activeKeys.has(key), `${key} should not be in the active pool`).toBe(false);
    }
  });

  it('keeps active minigames fully described, valid, and mapped', () => {
    for (const game of getPoolByFilter({ retired: false })) {
      expect(game.key.trim().length, `${game.key} needs a stable key`).toBeGreaterThan(0);
      expect(game.title.trim().length, `${game.key} needs a title`).toBeGreaterThan(0);
      expect(game.description.trim().length, `${game.key} needs a description`).toBeGreaterThan(0);
      expect(game.instructions.length, `${game.key} needs instructions`).toBeGreaterThan(0);
      expect(game.instructions.every((item) => item.trim().length > 0), `${game.key} has blank instructions`).toBe(true);
      expect(game.timeLimitMs, `${game.key} has a negative time limit`).toBeGreaterThanOrEqual(0);
      expect(game.weight, `${game.key} must have positive selection weight`).toBeGreaterThan(0);
      expect(VALID_SCORING_ADAPTERS.has(game.scoringAdapter), `${game.key} has an invalid scoring adapter`).toBe(true);
      expect(VALID_CATEGORIES.has(game.category), `${game.key} has an invalid category`).toBe(true);
      expect(VALID_METRIC_KINDS.has(game.metricKind), `${game.key} has an invalid metric kind`).toBe(true);

      if (game.authoritative) {
        expect(game.scoringAdapter, `${game.key} authoritative games must use the authoritative adapter`).toBe('authoritative');
      }

      if (game.resultMode === 'placement') {
        expect(game.authoritative, `${game.key} placement games must be authoritative`).toBe(true);
        expect(game.scoringAdapter, `${game.key} placement games must use the authoritative adapter`).toBe('authoritative');
      }

      if (game.implementation === 'react') {
        expect(game.reactComponentKey, `${game.key} needs a reactComponentKey`).toBeTruthy();
        const reactKey = game.reactComponentKey ?? '';
        const mappedComponent = reactComponents[reactKey as keyof typeof reactComponents];
        const specialCaseMapped = SPECIAL_CASE_COMPONENT_KEYS.has(reactKey);
        expect(Boolean(mappedComponent) || specialCaseMapped, `${game.key} is missing a React host mapping`).toBe(true);
        expect(game.legacy, `${game.key} react games should not be marked legacy`).toBe(false);
      } else {
        expect(game.modulePath, `${game.key} legacy games need a modulePath`).toBeTruthy();
        expect(game.legacy, `${game.key} legacy games must be marked legacy`).toBe(true);
      }

      if (game.replacedBy) {
        expect(getGame(game.replacedBy), `${game.key} points at a missing replacement`).toBeTruthy();
      }
    }
  });

  it('keeps retired entries self-consistent', () => {
    for (const game of getPoolByFilter({ retired: true })) {
      expect(game.retired, `${game.key} should remain retired`).toBe(true);
      if (game.replacedBy) {
        expect(getGame(game.replacedBy), `${game.key} points at a missing replacement`).toBeTruthy();
      }
      if (game.implementation === 'react') {
        expect(game.reactComponentKey, `${game.key} needs a reactComponentKey`).toBeTruthy();
      } else {
        expect(game.modulePath, `${game.key} needs a modulePath`).toBeTruthy();
      }
    }
  });
});
