import { describe, it, expect } from 'vitest';
import { computeCycleDeltas } from '../../../src/publicOpinion/PublicOpinionService';

describe('computeCycleDeltas', () => {
  it('returns empty array for empty events', () => {
    expect(computeCycleDeltas([])).toEqual([]);
  });

  it('HOH win gives +6 delta', () => {
    const deltas = computeCycleDeltas([{ type: 'hoh_win', playerId: 'p1', week: 1 }]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe(6);
    expect(deltas[0].playerId).toBe('p1');
  });

  it('POV win gives +4 delta', () => {
    const deltas = computeCycleDeltas([{ type: 'pov_win', playerId: 'p1', week: 1 }]);
    expect(deltas[0].delta).toBe(4);
  });

  it('nominated gives -2 delta', () => {
    const deltas = computeCycleDeltas([{ type: 'nominated', playerId: 'p1', week: 1 }]);
    expect(deltas[0].delta).toBe(-2);
  });

  it('multiple events stack', () => {
    const deltas = computeCycleDeltas([
      { type: 'hoh_win', playerId: 'p1', week: 1 },
      { type: 'positive_social', playerId: 'p1', week: 1 },
    ]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].delta).toBe(8); // 6 + 2
  });

  it('clamps to MAX_CYCLE_DELTA (12)', () => {
    const deltas = computeCycleDeltas([
      { type: 'hoh_win', playerId: 'p1', week: 1 }, // +6
      { type: 'pov_win', playerId: 'p1', week: 1 }, // +4
      { type: 'positive_social', playerId: 'p1', week: 1 }, // +2
      { type: 'positive_social', playerId: 'p1', week: 1 }, // +2
      { type: 'bold_nomination', playerId: 'p1', week: 1 }, // +3
    ]);
    expect(deltas[0].delta).toBe(12); // clamped to 12
  });

  it('clamps negative to -MAX_CYCLE_DELTA (-12)', () => {
    const deltas = computeCycleDeltas([
      { type: 'nominated', playerId: 'p1', week: 1 }, // -2
      { type: 'evicted_vote', playerId: 'p1', week: 1 }, // -3
      { type: 'betrayal', playerId: 'p1', week: 1 }, // -4
      { type: 'negative_social', playerId: 'p1', week: 1 }, // -2
      { type: 'negative_social', playerId: 'p1', week: 1 }, // -2
    ]);
    expect(deltas[0].delta).toBe(-12); // clamped to -12 (actual is -13)
  });

  it('different players get separate entries', () => {
    const deltas = computeCycleDeltas([
      { type: 'hoh_win', playerId: 'p1', week: 1 },
      { type: 'nominated', playerId: 'p2', week: 1 },
    ]);
    expect(deltas).toHaveLength(2);
    const p1 = deltas.find((d) => d.playerId === 'p1');
    const p2 = deltas.find((d) => d.playerId === 'p2');
    expect(p1?.delta).toBe(6);
    expect(p2?.delta).toBe(-2);
  });
});
