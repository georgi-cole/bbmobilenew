import { describe, it, expect } from 'vitest';
import { getDefaultCompetitionProfile, getMinigameAiModel } from '../../../src/ai/competition';

describe('competition AI foundation', () => {
  it('returns a default competition profile with baseline values', () => {
    const profile = getDefaultCompetitionProfile();

    expect(profile).toMatchObject({
      overall: 50,
      physical: 50,
      mental: 50,
      precision: 50,
      nerve: 50,
      consistency: 50,
      clutch: 50,
      chokeRisk: 50,
      luck: 50,
    });
  });

  it('returns fallback minigame metadata when no registry entry exists', () => {
    const model = getMinigameAiModel('unknown-minigame');

    expect(model.key).toBe('unknown-minigame');
    expect(model.scoreDirection).toBe('higher-is-better');
    expect(model.weights).toMatchObject({
      physical: 1,
      mental: 1,
      precision: 1,
      nerve: 1,
      luck: 1,
    });
  });
});
