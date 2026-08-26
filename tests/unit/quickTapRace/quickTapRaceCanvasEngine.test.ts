import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickTapRaceCanvasEngine } from '../../../src/minigames/quickTapRace/engine/quickTapRaceCanvasEngine';

// ── Canvas stub helpers ───────────────────────────────────────────────────────

function makeContextStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
    get globalAlpha() {
      return 1;
    },
    set font(_v: string) {},
    set textAlign(_v: CanvasTextAlign) {},
    set textBaseline(_v: CanvasTextBaseline) {},
    set shadowColor(_v: string) {},
    set shadowBlur(_v: number) {},
  };
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(makeContextStub() as unknown as CanvasRenderingContext2D);
  return canvas;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('QuickTapRaceCanvasEngine', () => {
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    window.cancelAnimationFrame = vi.fn((handle: number) => {
      window.clearTimeout(handle);
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts and provides an initial snapshot in countdown phase', () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });

    engine.start();
    const snap = engine.getSnapshot();
    expect(snap.phase).toBe('countdown');
    expect(snap.tapCount).toBe(0);
    expect(snap.effectiveScore).toBe(0);
  });

  it('with autoStart goes directly to playing phase', async () => {
    const onTick = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick,
      onFinish: vi.fn(),
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(32);
    const snap = engine.getSnapshot();
    expect(snap.phase).toBe('playing');
  });

  it('resize updates canvas backing resolution while leaving CSS size alone', () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });

    engine.resize(320, 480, 2);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(960);
    expect(canvas.style.width).toBe('');
    expect(canvas.style.height).toBe('');
  });

  it('keeps a visible GO frame before entering playing in non-autoStart mode', async () => {
    const onTick = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      onTick,
      onFinish: vi.fn(),
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(3_100);

    expect(onTick).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'countdown',
        countdown: 0,
      }),
    );

    await vi.advanceTimersByTimeAsync(32);
    expect(engine.getSnapshot().phase).toBe('playing');
  });

  it('stops the RAF loop after destroy with no further callbacks', async () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(32);
    engine.destroy();

    const callsBefore = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls
      .length;
    await vi.advanceTimersByTimeAsync(64);
    expect(
      (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(callsBefore);
  });

  it('counts taps and updates effectiveScore', async () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });
    engine.resize(320, 400, 1);

    engine.start();
    await vi.advanceTimersByTimeAsync(32); // enter playing phase

    // Hit the tap button center (layout computed from 320×400 canvas).
    // tapBtnCx ≈ 160, tapBtnCy ≈ 0.7 * 400 = 280 with the current layout.
    engine.handlePointerDown(1, { x: 160, y: 280 });
    engine.handlePointerDown(2, { x: 160, y: 280 });

    const snap = engine.getSnapshot();
    expect(snap.tapCount).toBe(2);
    expect(snap.effectiveScore).toBe(2);
  });

  it('fires onFinish when the timer reaches zero', async () => {
    const onFinish = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      duration: 1, // 1-second game
      onTick: vi.fn(),
      onFinish,
    });

    engine.resize(320, 400, 1);
    engine.start();

    // Advance past the 1-second duration.
    await vi.advanceTimersByTimeAsync(2_000);

    expect(onFinish).toHaveBeenCalledOnce();
    const [finalScore, rawTaps, modifiers] = onFinish.mock.calls[0] as [
      number,
      number,
      string[],
    ];
    expect(typeof finalScore).toBe('number');
    expect(typeof rawTaps).toBe('number');
    expect(Array.isArray(modifiers)).toBe(true);
  });

  it('emits timer updates while playing without requiring taps', async () => {
    const onTick = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick,
      onFinish: vi.fn(),
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(250);

    expect(onTick).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'playing', timeLeft: expect.any(Number) }),
    );
    expect(engine.getSnapshot().timeLeft).toBeLessThan(30);
  });

  it('uses the full wall-clock gap for gameplay while capping animation work', () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });
    const runFrame = (engine as unknown as { tick: (timestamp: number) => void }).tick;

    engine.start();
    runFrame(100);
    runFrame(1_100);

    expect(engine.getSnapshot().timeLeft).toBeCloseTo(29, 1);
  });

  it('does not fire onFinish twice even if destroy is called after game ends', async () => {
    const onFinish = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      duration: 1,
      onTick: vi.fn(),
      onFinish,
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(2_000);
    engine.destroy();

    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('activates a booster prompt when hit-tested on canvas', async () => {
    const onBooster = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
      onBoosterActivated: onBooster,
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32); // enter playing

    // First booster is scheduled at 6 s in; fast-forward to trigger it.
    await vi.advanceTimersByTimeAsync(6_200);

    const snap = engine.getSnapshot();
    expect(snap.visibleBooster).not.toBeNull();

    // The visible booster must expose the actual booster metadata (not "MYSTERY BOOSTER").
    expect(snap.visibleBooster!.label).toBeTruthy();
    expect(snap.visibleBooster!.icon).toBeTruthy();
    expect(typeof snap.visibleBooster!.beneficial).toBe('boolean');

    // Tap the centre of the booster prompt area (boosterX, boosterY from layout).
    // The booster prompt is drawn above the tap button.
    // Layout: tapBtnCy = 400 * 0.7 = 280, tapBtnRadius ≈ min(96, 88, 84) = 84
    //         boosterHeight ≈ min(64, max(44, 400*0.14≈56)) = 56
    //         boosterY = 280 - 84 - 56 - 24 = 116
    //         boosterX = (320 - boosterWidth)/2 where boosterWidth = min(320*0.72≈230, 240) = 230
    //         boosterX ≈ 45
    //         Centre = (45 + 230/2, 116 + 56/2) = (160, 144)
    engine.handlePointerDown(1, { x: 160, y: 144 });

    expect(onBooster).toHaveBeenCalledOnce();
    expect(engine.getSnapshot().visibleBooster).toBeNull();
  });

  it('multiple pointer IDs within the same frame are each counted as separate taps', async () => {
    const canvas = makeCanvas();
    const onTick = vi.fn();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick,
      onFinish: vi.fn(),
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32); // enter playing

    const beforeTaps = engine.getSnapshot().tapCount;
    engine.handlePointerDown(1, { x: 160, y: 280 });
    // A second down with a different pointer id should count as a separate tap.
    engine.handlePointerDown(2, { x: 160, y: 280 });
    expect(engine.getSnapshot().tapCount).toBe(beforeTaps + 2);
  });

  it('ignores stale backlogged taps delivered long after they occurred', async () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32); // enter playing

    const beforeTaps = engine.getSnapshot().tapCount;
    // A tap whose delivery latency exceeds the stale threshold is dropped.
    engine.handlePointerDown(1, { x: 160, y: 280 }, 0, 500);
    expect(engine.getSnapshot().tapCount).toBe(beforeTaps);

    // A promptly-delivered fast tap is still counted.
    engine.handlePointerDown(2, { x: 160, y: 280 }, 500, 510);
    expect(engine.getSnapshot().tapCount).toBe(beforeTaps + 1);
  });

  it('does not filter taps when timestamp epochs are mismatched (huge latency)', async () => {
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      onTick: vi.fn(),
      onFinish: vi.fn(),
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32); // enter playing

    const beforeTaps = engine.getSnapshot().tapCount;
    // Latency beyond the sane upper bound implies a different timestamp epoch,
    // so filtering is skipped (fail-open) and the tap still counts.
    engine.handlePointerDown(1, { x: 160, y: 280 }, 0, 1_700_000_000_000);
    expect(engine.getSnapshot().tapCount).toBe(beforeTaps + 1);
  });

  it('strict wall-clock mode rejects queued input after the real deadline', async () => {
    const onFinish = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      duration: 1,
      strictWallClock: true,
      onTick: vi.fn(),
      onFinish,
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32);

    engine.handlePointerDown(1, { x: 160, y: 280 }, 900, performance.now() + 2_000);

    expect(engine.getSnapshot().tapCount).toBe(0);
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][3]).toEqual(
      expect.objectContaining({ afterDeadlineTapsRejected: 1 }),
    );
  });

  it('reports input-rate and pointer telemetry without changing the score', async () => {
    const onFinish = vi.fn();
    const canvas = makeCanvas();
    const engine = new QuickTapRaceCanvasEngine(canvas, {
      seed: 42,
      autoStart: true,
      duration: 1,
      strictWallClock: true,
      lowLatencyInput: true,
      onTick: vi.fn(),
      onFinish,
    });

    engine.resize(320, 400, 1);
    engine.start();
    await vi.advanceTimersByTimeAsync(32);
    const clock = performance.now();
    engine.handlePointerDown(10, { x: 160, y: 280 }, clock + 100, clock + 100, 'touch');
    engine.handlePointerUp(10);
    engine.handlePointerDown(11, { x: 160, y: 280 }, clock + 200, clock + 200, 'touch');
    engine.handlePointerUp(11);
    await vi.advanceTimersByTimeAsync(1_100);

    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][1]).toBe(2);
    expect(onFinish.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        peakOneSecondTaps: 2,
        medianInterTapMs: 100,
        uniquePointerCount: 2,
        maxConcurrentPointers: 1,
        pointerTypeCounts: { touch: 2 },
      }),
    );
  });
});
