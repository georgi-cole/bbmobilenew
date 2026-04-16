import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickTapRaceCanvasEngine } from '../../../src/minigames/laneRacers/engine/quickTapRaceCanvasEngine';
import { cryptoSeed } from '../../../src/features/riskWheel/cryptoSpin';

vi.mock('../../../src/features/riskWheel/cryptoSpin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/features/riskWheel/cryptoSpin')>();
  return {
    ...actual,
    cryptoSeed: vi.fn(),
  };
});

function createCanvas() {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  return canvas;
}

describe('Lane Racers canvas engine seed handling', () => {
  beforeEach(() => {
    vi.mocked(cryptoSeed).mockReset();
  });

  it('auto-reseeds fresh runs when no explicit seed is supplied', () => {
    vi.mocked(cryptoSeed)
      .mockReturnValueOnce(101)
      .mockReturnValueOnce(202);

    const first = new QuickTapRaceCanvasEngine(createCanvas(), {
      racers: [{ id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' }],
      onFinish: vi.fn(),
    });
    const second = new QuickTapRaceCanvasEngine(createCanvas(), {
      racers: [{ id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' }],
      onFinish: vi.fn(),
    });

    expect(first.getSeed()).toBe(101);
    expect(second.getSeed()).toBe(202);
    expect(cryptoSeed).toHaveBeenCalledTimes(2);
  });

  it('honors an explicit deterministic seed for tests and debug runs', () => {
    const engine = new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 77,
      racers: [{ id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' }],
      onFinish: vi.fn(),
    });

    expect(engine.getSeed()).toBe(77);
    expect(cryptoSeed).not.toHaveBeenCalled();
  });
});
