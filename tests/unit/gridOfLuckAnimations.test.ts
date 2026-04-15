import { describe, expect, it } from 'vitest';
import {
  boxOpenSequence,
  boxVariants,
  lpFloatVariants,
  playerVariants,
  screenEffects,
} from '../../src/animations/gridOfLuckAnimations';

describe('gridOfLuckAnimations', () => {
  it('exports the required box, player, LP, and screen variants', () => {
    expect(Object.keys(boxVariants)).toEqual(expect.arrayContaining(['idle', 'hover', 'press', 'locked', 'opened']));
    expect(Object.keys(boxOpenSequence)).toEqual(expect.arrayContaining(['preOpen', 'crack', 'reveal', 'settle']));
    expect(Object.keys(playerVariants)).toEqual(expect.arrayContaining(['activePlayer', 'targetedPlayer', 'eliminatedPlayer']));
    expect(Object.keys(lpFloatVariants)).toEqual(expect.arrayContaining(['initial', 'animate']));
    expect(Object.keys(screenEffects)).toEqual(expect.arrayContaining(['idle', 'vignette', 'zoomIn', 'flash']));
  });
});
