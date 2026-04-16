import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultCrackerCanvasEngine } from '../../../src/minigames/vaultCracker/engine/vaultCrackerCanvasEngine';

function makeGradientStub() {
  return {
    addColorStop: vi.fn(),
  };
}

function makeContextStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn(() => makeGradientStub()),
    createRadialGradient: vi.fn(() => makeGradientStub()),
    set fillStyle(_value: string | CanvasGradient) {},
    set strokeStyle(_value: string | CanvasGradient) {},
    set lineWidth(_value: number) {},
    set globalAlpha(_value: number) {},
    set lineCap(_value: CanvasLineCap) {},
    set textAlign(_value: CanvasTextAlign) {},
    set textBaseline(_value: CanvasTextBaseline) {},
    set font(_value: string) {},
  };
}

describe('VaultCrackerCanvasEngine', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(makeContextStub());
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 16) as unknown as number;
    });
    window.cancelAnimationFrame = vi.fn((handle: number) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts, pauses, resumes, resizes, and destroys without leaking the RAF loop', async () => {
    const canvas = document.createElement('canvas');
    const engine = new VaultCrackerCanvasEngine(canvas, { seed: 42 });

    engine.resize(240, 480, 2);
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(960);

    engine.start();
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(32);
    const snapshotWhileRunning = engine.getSnapshot();
    expect(snapshotWhileRunning.phase).toBe('active');

    engine.pause();
    expect(engine.getSnapshot().phase).toBe('paused');

    const requestCallsBeforeResume = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    engine.resume();
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(requestCallsBeforeResume);

    engine.destroy();
    const requestCallsBeforeDestroyAdvance = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(64);
    expect((window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length).toBe(requestCallsBeforeDestroyAdvance);
  });
});
