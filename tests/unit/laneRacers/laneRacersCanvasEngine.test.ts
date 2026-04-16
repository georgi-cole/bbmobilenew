import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickTapRaceCanvasEngine } from '../../../src/minigames/laneRacers/engine/quickTapRaceCanvasEngine';
import { cryptoSeed } from '../../../src/features/riskWheel/cryptoSpin';
import type { QuickTapRaceRuntimeState } from '../../../src/minigames/laneRacers/engine/types';

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

function getState(engine: QuickTapRaceCanvasEngine): QuickTapRaceRuntimeState {
  return (engine as unknown as { state: QuickTapRaceRuntimeState }).state;
}

function activateEngine(engine: QuickTapRaceCanvasEngine) {
  const state = getState(engine);
  state.phase = 'active';
  state.lastActivePhase = 'active';
  state.countdownMs = 0;
  state.phaseElapsedMs = 0;
}

function advanceEngine(engine: QuickTapRaceCanvasEngine, totalMs: number, stepMs = 16) {
  const updater = (engine as unknown as { update: (deltaMs: number) => void }).update.bind(engine);
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    updater(stepMs);
  }
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

  it('updates racer velocity and progress from taps', () => {
    const engine = new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 77,
      racers: [
        { id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' },
        { id: 'p1', name: 'AI', isPlayer: false, color: '#f97316', targetScore: 180 },
      ],
      onFinish: vi.fn(),
    });

    activateEngine(engine);

    for (let tapCount = 0; tapCount < 6; tapCount += 1) {
      engine.handlePointerTap(1, { x: 180, y: 540 });
      advanceEngine(engine, 90);
      engine.handlePointerRelease(1);
    }

    const player = getState(engine).racers[0];
    const progressAfterTapBurst = player.progress;
    expect(progressAfterTapBurst).toBeGreaterThan(0.007);
    expect(player.velocity).toBeGreaterThan(0.004);

    advanceEngine(engine, 500);

    expect(getState(engine).racers[0].progress).toBeGreaterThan(progressAfterTapBurst);
  });

  it('keeps a default race running well past 30 seconds before the finish', () => {
    const engine = new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 77,
      racers: [
        { id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' },
        { id: 'p1', name: 'AI', isPlayer: false, color: '#f97316', targetScore: 180 },
      ],
      onFinish: vi.fn(),
    });

    activateEngine(engine);
    advanceEngine(engine, 30_000);

    expect(getState(engine).result).toBeNull();
    expect(getState(engine).timeLeftMs).toBeGreaterThan(25_000);
  });

  it('triggers spatial pickups when a racer reaches them on the track', () => {
    const engine = new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 91,
      racers: [{ id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' }],
      onFinish: vi.fn(),
    });

    activateEngine(engine);

    const state = getState(engine);
    const player = state.racers[0];
    const firstPickup = player.pickups[0];

    player.progress = firstPickup.progress - 0.001;
    player.momentum = 0.1;
    player.velocity = 0.08;

    advanceEngine(engine, 120);

    expect(firstPickup.triggered).toBe(true);
    expect(player.activeEffects.length + player.shieldCharges).toBeGreaterThan(0);
    expect(state.pickupBursts.length).toBeGreaterThan(0);
  });

  it('lets the player dodge the next pickup instead of auto-collecting it', () => {
    const engine = new QuickTapRaceCanvasEngine(createCanvas(), {
      seed: 91,
      racers: [{ id: 'p0', name: 'You', isPlayer: true, color: '#38bdf8' }],
      onFinish: vi.fn(),
    });

    activateEngine(engine);
    engine.armPickupDodge();

    const state = getState(engine);
    const player = state.racers[0];
    const firstPickup = player.pickups[0];

    player.progress = firstPickup.progress - 0.001;
    player.momentum = 0.1;
    player.velocity = 0.08;

    advanceEngine(engine, 120);

    expect(firstPickup.triggered).toBe(true);
    expect(player.activeEffects).toHaveLength(0);
    expect(player.shieldCharges).toBe(0);
    expect(state.playerPickupDodgeMs).toBe(0);
    expect(state.pickupBursts.at(-1)?.icon).toBe('↷');
  });
});
