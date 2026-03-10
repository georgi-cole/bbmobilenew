import { describe, expect, it } from 'vitest';
import type { CompetitionSkillProfile } from '../../../src/ai/competition/types';
import type { CompetitionRunTelemetry } from '../../../src/ai/competition/telemetry';
import { summarizeCompetitionTelemetry } from '../../../src/ai/competition/telemetry';

const profiles: Record<string, CompetitionSkillProfile> = {
  p1: {
    overall: 75,
    physical: 85,
    mental: 80,
    precision: 70,
    nerve: 60,
    consistency: 55,
    clutch: 55,
    chokeRisk: 45,
    luck: 40,
  },
  p2: {
    overall: 55,
    physical: 45,
    mental: 40,
    precision: 50,
    nerve: 55,
    consistency: 50,
    clutch: 50,
    chokeRisk: 50,
    luck: 45,
  },
  p3: {
    overall: 45,
    physical: 40,
    mental: 35,
    precision: 30,
    nerve: 40,
    consistency: 35,
    clutch: 35,
    chokeRisk: 55,
    luck: 50,
  },
};

const runs: CompetitionRunTelemetry[] = [
  {
    gameKey: 'quickTap',
    seed: 11,
    participants: ['p1', 'p2', 'p3'],
    canonicalScores: { p1: 900, p2: 500, p3: 100 },
    rawScores: { p1: 90, p2: 50, p3: 10 },
    winnerId: 'p1',
    timestamp: 1,
  },
  {
    gameKey: 'triviaPulse',
    seed: 12,
    participants: ['p1', 'p2'],
    canonicalScores: { p1: 200, p2: 800 },
    rawScores: { p1: 20, p2: 80 },
    winnerId: 'p2',
    timestamp: 2,
  },
];

describe('competition telemetry summary', () => {
  it('summarizes per-player, per-minigame, and per-category metrics', () => {
    const summary = summarizeCompetitionTelemetry(runs, {
      playerProfiles: profiles,
      closeMarginThreshold: 100,
    });

    expect(summary.totalRuns).toBe(2);
    expect(summary.perPlayer.p1.entries).toBe(2);
    expect(summary.perPlayer.p1.wins).toBe(1);
    expect(summary.perPlayer.p1.winRate).toBeCloseTo(0.5);

    expect(summary.perMinigame.quickTap.runs).toBe(1);
    expect(summary.perMinigame.quickTap.averageWinningScore).toBe(900);
    expect(summary.perMinigame.quickTap.averageScoreSpread).toBe(800);

    expect(summary.perCategory.physical.runs).toBe(1);
    expect(summary.perCategory.mental.runs).toBe(1);

    expect(summary.outcomes.upsetCount).toBe(1);
    expect(summary.outcomes.upsetRate).toBeCloseTo(0.5);
    expect(summary.outcomes.averageMargin).toBe(500);
    expect(summary.outcomes.closeFinishRate).toBe(0);
  });
});
