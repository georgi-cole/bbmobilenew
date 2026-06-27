import { describe, expect, it } from 'vitest';

import {
  HINT_PENALTY_POINTS,
  applyHintPenalty,
  buildColorMatchCompetitionRawResults,
  buildHintMessage,
  calculateColorMatchAccuracy,
  createColorMatchCompetitionStandings,
  formatColorMatchScore,
  getColorMatchAiRoundScore,
  getColorMatchFeedbackState,
  getColorMatchScoreDisplayPrecision,
  normalizeColorMatchCompetitionScore,
  randomStartColor,
  rankColorMatchCompetitionStandings,
  resolveColorMatchCompetitionRound,
  rgbToHex,
  seededPick,
  simulateColorMatchAiRoundScore,
  type ColorMatchCompetitionParticipant,
  type RGB,
} from '../src/components/ColorMatchComp/colorMatchUtils';

describe('Color Match rules', () => {
  it('formats colors, hints, and score labels predictably', () => {
    const target: RGB = { r: 255, g: 0, b: 16 };
    expect(rgbToHex(target)).toBe('#ff0010');
    expect(calculateColorMatchAccuracy(target, target)).toBe(100);
    expect(normalizeColorMatchCompetitionScore(121.234)).toBe(100);
    expect(normalizeColorMatchCompetitionScore(-5)).toBe(0);
    expect(formatColorMatchScore(93.456, 1)).toBe('93.5%');
    expect(applyHintPenalty(90, 2)).toBe(80);
    expect(HINT_PENALTY_POINTS).toBe(5);

    const message = buildHintMessage(
      { r: 200, g: 20, b: 100 },
      { r: 140, g: 20, b: 120 },
    );
    expect(message).toContain('increase red');
    expect(message).toContain('green level is accurate');
    expect(message).toContain('decrease blue');

    const start = randomStartColor({ r: 100, g: 100, b: 100 }, () => 0.25);
    expect(start).toEqual({ r: 160, g: 160, b: 160 });

    const pick = seededPick(['a', 'b', 'c', 'd'], 2, () => 0.1);
    expect(pick).toHaveLength(2);
    expect(new Set(pick).size).toBe(2);
    expect(pick.every((value) => ['a', 'b', 'c', 'd'].includes(value))).toBe(true);
  });

  it('scores AI rounds and display precision deterministically', () => {
    const participant: Pick<ColorMatchCompetitionParticipant, 'id' | 'participantIndex' | 'precomputedScore'> = {
      id: 'ai-1',
      participantIndex: 2,
      precomputedScore: 84,
    };

    const score = simulateColorMatchAiRoundScore(participant, 3, 99);
    expect(score).toBeGreaterThanOrEqual(65);
    expect(score).toBeLessThanOrEqual(99);
    expect(simulateColorMatchAiRoundScore(participant, 3, 99)).toBe(score);
    expect(getColorMatchAiRoundScore(participant, 3, 99, [12, 34, 56])).toBe(56);
    expect(getColorMatchScoreDisplayPrecision([99.2, 99.3])).toBe(1);
  });

  it('resolves competition rounds and ranking order', () => {
    const participants: ColorMatchCompetitionParticipant[] = [
      { id: 'human', name: 'You', isHuman: true, precomputedScore: 90, participantIndex: 0 },
      { id: 'ai-1', name: 'AI 1', isHuman: false, precomputedScore: 60, participantIndex: 1 },
      { id: 'ai-2', name: 'AI 2', isHuman: false, precomputedScore: 80, participantIndex: 2 },
    ];

    const standings = createColorMatchCompetitionStandings(participants);
    const round1 = resolveColorMatchCompetitionRound(standings, 1, {
      human: 92,
      'ai-1': 45,
      'ai-2': 75,
    });
    expect(round1.eliminatedIds).toEqual(['ai-1']);

    const finalRound = resolveColorMatchCompetitionRound(round1.standings, 5, {
      human: 97,
      'ai-2': 88,
    });
    expect(finalRound.activeIds).toEqual(['human']);

    const ranked = rankColorMatchCompetitionStandings(finalRound.standings);
    expect(ranked[0].participantId).toBe('human');

    const rawResults = buildColorMatchCompetitionRawResults(finalRound.standings);
    expect(Object.values(rawResults).every((value) => Number.isFinite(value))).toBe(true);
    expect(rawResults.human).toBeGreaterThan(rawResults['ai-1']);
    expect(rawResults.human).toBeGreaterThan(rawResults['ai-2']);

    const retryState = getColorMatchFeedbackState({
      competitionMode: true,
      humanStillActive: true,
      activeCompetitionCount: 2,
      nextIndex: 5,
      maxRounds: 5,
    });
    expect(retryState.rematchPending).toBe(true);
    expect(retryState.competitionOver).toBe(false);
    expect(retryState.ctaLabel).toBe('Next Round →');

    const resultsState = getColorMatchFeedbackState({
      competitionMode: false,
      humanStillActive: false,
      activeCompetitionCount: 1,
      nextIndex: 5,
      maxRounds: 5,
    });
    expect(resultsState.competitionOver).toBe(true);
    expect(resultsState.ctaLabel).toBe('See Results →');
  });
});
