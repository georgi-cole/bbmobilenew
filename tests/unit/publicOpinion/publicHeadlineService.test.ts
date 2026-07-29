import { describe, it, expect } from 'vitest';
import {
  generateDailyPublicUpdate,
} from '../../../src/publicOpinion/PublicHeadlineService';
import { publicOpinionConfig } from '../../../src/publicOpinion/publicOpinionConfig';

const PLAYERS = [
  { id: 'p1', name: 'Aria' },
  { id: 'p2', name: 'Kian' },
  { id: 'p3', name: 'Rae' },
  { id: 'p4', name: 'Echo' },
  { id: 'p5', name: 'Jax' },
];

describe('generateDailyPublicUpdate', () => {
  it('returns empty update for no active players', () => {
    const result = generateDailyPublicUpdate({ activePlayers: [], week: 1, seed: 42 });
    expect(result.headlineEvents).toHaveLength(0);
    expect(result.backgroundDrifts).toHaveLength(0);
  });

  it('generates at most headlineEventsPerDayMax headline events', () => {
    const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 42 });
    expect(result.headlineEvents.length).toBeLessThanOrEqual(
      publicOpinionConfig.headlineEventsPerDayMax,
    );
  });

  it('generates headline events only for distinct players', () => {
    const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 42 });
    const ids = result.headlineEvents.map((e) => e.playerId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('headline event delta is within severity band bounds', () => {
    const { headlineSeverityBands } = publicOpinionConfig;
    const allBandMins = Object.values(headlineSeverityBands).map((b) => b.minMag);
    const allBandMaxes = Object.values(headlineSeverityBands).map((b) => b.maxMag);
    const globalMin = Math.min(...allBandMins);
    const globalMax = Math.max(...allBandMaxes);

    // Run several seeds to exercise more templates and severity picks
    for (let seed = 0; seed < 20; seed++) {
      const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 2, seed });
      for (const event of result.headlineEvents) {
        const magnitude = Math.abs(event.delta);
        expect(magnitude).toBeGreaterThanOrEqual(globalMin);
        expect(magnitude).toBeLessThanOrEqual(globalMax);
      }
    }
  });

  it('shocking events can produce deltas of at least 19 points', () => {
    // Run many seeds to ensure shocking events are reachable
    let foundShocking = false;
    for (let seed = 0; seed < 200 && !foundShocking; seed++) {
      const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 3, seed });
      if (result.headlineEvents.some((e) => Math.abs(e.delta) >= 19)) {
        foundShocking = true;
      }
    }
    expect(foundShocking).toBe(true);
  });

  it('background drift is applied to players not receiving a headline', () => {
    const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 42 });
    const headlineIds = new Set(result.headlineEvents.map((e) => e.playerId));
    const driftIds = new Set(result.backgroundDrifts.map((d) => d.playerId));
    // No player should appear in both
    for (const id of headlineIds) {
      expect(driftIds.has(id)).toBe(false);
    }
    // Every active player is covered
    const allCovered = PLAYERS.every(
      (p) => headlineIds.has(p.id) || driftIds.has(p.id),
    );
    expect(allCovered).toBe(true);
  });

  it('background drift is always non-zero — every non-spotlighted player moves each day', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed });
      for (const drift of result.backgroundDrifts) {
        expect(Math.abs(drift.delta)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is deterministic — same seed/week always produces same events', () => {
    const a = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 4, seed: 99 });
    const b = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 4, seed: 99 });
    expect(a.headlineEvents.map((e) => e.playerId)).toEqual(b.headlineEvents.map((e) => e.playerId));
    expect(a.headlineEvents.map((e) => e.delta)).toEqual(b.headlineEvents.map((e) => e.delta));
  });

  it('different seeds produce different results', () => {
    // Compare full results for two pre-verified fixed seeds using deep equality
    const a = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 1 });
    const b = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 99 });
    expect(a).not.toEqual(b);
  });

  it('excludeIds are not given headline events', () => {
    const result = generateDailyPublicUpdate({
      activePlayers: PLAYERS,
      week: 1,
      seed: 42,
      excludeIds: ['p1', 'p2'],
    });
    const headlineIds = result.headlineEvents.map((e) => e.playerId);
    expect(headlineIds).not.toContain('p1');
    expect(headlineIds).not.toContain('p2');
  });

  it('headline events have non-empty text', () => {
    const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed: 42 });
    for (const event of result.headlineEvents) {
      expect(event.text.length).toBeGreaterThan(0);
    }
  });

  it('does not invent relationships or accusations without a grounded public event', () => {
    for (let seed = 0; seed < 50; seed++) {
      const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed });
      for (const event of result.headlineEvents) {
        const otherNames = PLAYERS.filter((player) => player.id !== event.playerId).map(
          (player) => player.name,
        );
        expect(otherNames.some((name) => event.text.includes(name))).toBe(false);
      }
    }
  });

  it('headline count varies between min and max across different seeds', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      const result = generateDailyPublicUpdate({ activePlayers: PLAYERS, week: 1, seed });
      counts.add(result.headlineEvents.length);
    }
    // With 50 seeds we should see both 2 and 3 (min and max)
    expect(counts.has(publicOpinionConfig.headlineEventsPerDayMin)).toBe(true);
    expect(counts.has(publicOpinionConfig.headlineEventsPerDayMax)).toBe(true);
  });

  it('handles single player — gives that player the headline, no background drift', () => {
    const result = generateDailyPublicUpdate({
      activePlayers: [{ id: 'solo', name: 'Solo' }],
      week: 1,
      seed: 42,
    });
    expect(result.headlineEvents).toHaveLength(1);
    expect(result.headlineEvents[0].playerId).toBe('solo');
    expect(result.backgroundDrifts).toHaveLength(0);
  });
});
