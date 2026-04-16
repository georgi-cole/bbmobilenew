import { describe, expect, it, vi } from 'vitest';
import { drawUiOverlays } from '../../../src/minigames/laneRacers/engine/renderUi';
import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from '../../../src/minigames/laneRacers/engine/types';

function createGradientStub(): CanvasGradient {
  return {
    addColorStop: vi.fn(),
  } as unknown as CanvasGradient;
}

function createContextStub(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => createGradientStub()),
    set fillStyle(_value: string | CanvasGradient) {},
    set strokeStyle(_value: string | CanvasGradient) {},
    set lineWidth(_value: number) {},
    set font(_value: string) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D;
}

function createState(): QuickTapRaceRuntimeState {
  return {
    phase: 'active',
    lastActivePhase: 'active',
    phaseElapsedMs: 0,
    elapsedMs: 0,
    timeLeftMs: 30_000,
    countdownMs: 0,
    raceDurationMs: 30_000,
    racers: [],
    tapBursts: [],
    pickupBursts: [],
    screenPulse: 0,
    finishFlash: 0,
    cameraShake: 0,
    statusText: 'Ready',
    result: null,
    lastPointerId: null,
  };
}

function createLayout(): QuickTapRaceLayout {
  return {
    width: 360,
    height: 620,
    dpr: 1,
    paddingX: 20,
    paddingY: 24,
    headerRect: { x: 20, y: 24, width: 320, height: 72 },
    trackRect: { x: 20, y: 104, width: 320, height: 300 },
    tapZoneRect: { x: 20, y: 474, width: 320, height: 110 },
    statusRect: { x: 20, y: 412, width: 320, height: 54 },
    laneGap: 12,
    laneHeight: 60,
    lanes: [],
  };
}

describe('drawUiOverlays', () => {
  it('falls back when roundRect is unavailable on the canvas context', () => {
    const ctx = createContextStub();

    expect(() => drawUiOverlays(ctx, createState(), createLayout())).not.toThrow();
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.quadraticCurveTo).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});
