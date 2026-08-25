import { selectBoosterPrompts } from '../../../ai/competition/quickTapSimulation';
import type { ScheduledBoosterPrompt } from '../../../ai/competition/quickTapSimulation';
import type {
  QTREngineOptions,
  QTREnginePhase,
  QTREngineSnapshot,
  QTRLayout,
  QTRParticle,
  QTRTimingDiagnostics,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const READY_COUNT = 3;
const DEFAULT_DURATION = 30;

/**
 * Maximum delivery latency (ms) a pointer-down may have before it is treated as
 * a stale, backlogged tap and ignored. When the main thread janks during very
 * fast tapping, the browser can buffer a burst of pointer events and deliver
 * them late — after the player has already lifted their finger (e.g. to collect
 * a mystery box). Dropping these late events stops taps from "catching up"
 * after release (issue #951, item 6). The upper bound guards against user-agents
 * whose event timestamps use a different epoch than `performance.now()`, in
 * which case the computed latency is nonsensical and filtering is skipped.
 */
const STALE_TAP_MIN_LATENCY_MS = 120;
const STALE_TAP_MAX_LATENCY_MS = 5000;

/** Emoji pools for each heat level 0–5. */
const HEAT_EMOJIS: string[][] = [
  ['👆', '✨'],
  ['👆', '✨', '💥'],
  ['🔥', '✨', '💥', '⚡'],
  ['🔥', '💥', '⚡', '🌟'],
  ['🔥', '💥', '🌪️', '🌟', '⚡'],
  ['💥', '🌪️', '🌟', '⚡', '🔥', '☄️'],
];

/** Tap-button fill colors per heat level. */
const HEAT_BTN_COLORS = [
  '#7c3aed',
  '#7c3aed',
  '#b44900',
  '#d43800',
  '#e62000',
  '#ff2000',
];

/** Canvas background colors per heat level. */
const HEAT_BG_COLORS = [
  'rgba(15, 15, 25, 0.98)',
  'rgba(15, 15, 25, 0.98)',
  'rgba(10, 0, 0, 0.98)',
  'rgba(20, 5, 0, 0.98)',
  'rgba(30, 8, 0, 0.98)',
  'rgba(40, 10, 0, 0.98)',
];

/** Heat-dot active colors indexed 0–5. */
const HEAT_DOT_COLORS = ['#ff8c00', '#ff6400', '#ff4000', '#ff2000', '#ff0000', '#ffffff'];

const PARTICLE_LIFE_MS = 700;
/** Pixels per millisecond for particle velocity magnitude. */
const PARTICLE_SPEED = 0.16;
const MAX_PARTICLES = 60;
const BOOSTER_PROMPT_PULSE_BASE = 0.88;
const BOOSTER_PROMPT_PULSE_AMPLITUDE = 0.12;
const BOOSTER_PROMPT_PULSE_PERIOD_MS = 120;
const BOOSTER_PROMPT_GLOW_BASE_ALPHA = 0.28;
const BOOSTER_PROMPT_GLOW_PULSE_ALPHA = 0.12;
const BOOSTER_PROMPT_BASE_COLOR_RGB = '96, 165, 250';
const BOOSTER_PROMPT_SHADOW_BLUR_BASE = 14;
const BOOSTER_PROMPT_SHADOW_BLUR_SCALE = 10;
const HIGH_HEAT_THRESHOLD = 4;

/** Returns the array element at `index`, or the last element if `index` is out of bounds. */
function atOrLast<T>(arr: T[], index: number): T {
  return arr[Math.min(index, arr.length - 1)];
}

// ── Layout ────────────────────────────────────────────────────────────────────

function makeLayout(width: number, height: number, dpr: number): QTRLayout {
  const topPadding = Math.max(20, Math.round(height * 0.08));
  const bottomPadding = Math.max(20, Math.round(height * 0.08));
  const boosterGap = Math.max(18, Math.round(height * 0.06));
  const heatDotsGap = Math.max(18, Math.round(height * 0.05));

  const tapBtnRadius = Math.min(width * 0.3, height * 0.22, 84);
  const tapBtnCx = width * 0.5;

  const boosterWidth = Math.min(width * 0.72, 240);
  const boosterHeight = Math.min(64, Math.max(44, height * 0.14));
  const minTapBtnCy = topPadding + heatDotsGap + boosterHeight + boosterGap + tapBtnRadius;
  const preferredTapBtnCy = height * 0.7;
  const maxTapBtnCy = height - tapBtnRadius - bottomPadding;
  const tapBtnCy = Math.min(maxTapBtnCy, Math.max(minTapBtnCy, preferredTapBtnCy));
  const boosterX = (width - boosterWidth) / 2;
  const boosterY = tapBtnCy - tapBtnRadius - boosterHeight - boosterGap;

  const heatDotsY = Math.max(topPadding, boosterY - heatDotsGap);

  return {
    width,
    height,
    dpr,
    tapBtnCx,
    tapBtnCy,
    tapBtnRadius,
    boosterX,
    boosterY,
    boosterWidth,
    boosterHeight,
    heatDotsY,
  };
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class QuickTapRaceCanvasEngine {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private readonly options: QTREngineOptions;

  private phase: QTREnginePhase = 'idle';

  private countdown = READY_COUNT;

  private countdownElapsedMs = 0;

  private countdownGoFramePending = false;

  private timeLeftMs: number;

  private tapCount = 0;

  private effectiveScore = 0;

  /** Timestamps (game-relative ms) of recent taps used for heat calculation. */
  private recentTapTimestamps: number[] = [];

  private heatLevel = 0;

  private activeMultiplier: number | null = null;

  private activeMultiplierEndsAtMs: number | null = null;

  private activeBoosterLabel: string | null = null;

  private appliedModifiers: string[] = [];

  private visibleBooster: ScheduledBoosterPrompt | null = null;

  private particles: QTRParticle[] = [];

  /** Accumulated game time during the playing phase (ms). */
  private gameElapsedMs = 0;

  /** Game-relative ms when the last tap occurred — used for tap-press visual feedback. */
  private lastTapMs = -1000;

  private layout: QTRLayout;

  private rafId = 0;

  private lastTimestamp = 0;

  private isRunning = false;

  private isDestroyed = false;

  private finishReported = false;

  private playingStartedAtMs: number | null = null;

  private strictDeadlineMs: number | null = null;

  private longestFrameMs = 0;

  private staleTapsRejected = 0;

  private afterDeadlineTapsRejected = 0;

  private lastLowLatencyUiUpdateMs = 0;

  private lastTimerUiUpdateMs = 0;

  private readonly acceptedTapTimesMs: number[] = [];

  private readonly uniquePointerIds = new Set<number>();

  private readonly activePointerIds = new Set<number>();

  private maxConcurrentPointers = 0;

  private readonly pointerTypeCounts: Record<string, number> = {};

  private readonly boosterTimeouts: ReturnType<typeof setTimeout>[] = [];

  constructor(canvas: HTMLCanvasElement, options: QTREngineOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('QuickTapRace canvas could not acquire a 2D context.');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.options = options;
    this.timeLeftMs = (options.duration ?? DEFAULT_DURATION) * 1000;
    this.layout = makeLayout(canvas.clientWidth || 320, canvas.clientHeight || 400, 1);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.isDestroyed || this.rafId !== 0) return;
    if (this.options.autoStart) {
      this.phase = 'countdown';
      this.countdown = 0;
    } else {
      this.phase = 'countdown';
    }
    this.isRunning = true;
    this.lastTimestamp = 0;
    this.render();
    this.rafId = window.requestAnimationFrame(this.tick);
    this.emitTick();
  }

  destroy(): void {
    this.isRunning = false;
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.isDestroyed = true;
    this.boosterTimeouts.forEach(clearTimeout);
    this.boosterTimeouts.length = 0;
  }

  resize(width: number, height: number, dpr: number): void {
    if (this.isDestroyed || width <= 0 || height <= 0) return;
    const pixelRatio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    this.layout = makeLayout(width, height, pixelRatio);
    this.canvas.width = Math.max(1, Math.round(width * pixelRatio));
    this.canvas.height = Math.max(1, Math.round(height * pixelRatio));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(pixelRatio, pixelRatio);
    this.render();
  }

  getSnapshot(): QTREngineSnapshot {
    return {
      phase: this.phase,
      countdown: this.countdown,
      timeLeft: this.timeLeftMs / 1000,
      tapCount: this.tapCount,
      effectiveScore: Math.round(this.effectiveScore),
      heatLevel: this.heatLevel,
      activeMultiplier: this.activeMultiplier,
      visibleBooster: this.visibleBooster,
    };
  }

  /**
   * Forward a pointer-down event (CSS pixel coordinates relative to canvas origin)
   * to the engine for hit testing against the tap button and booster prompt.
   */
  handlePointerDown(
    pointerId: number,
    point: { x: number; y: number },
    eventTimeStampMs?: number,
    nowMs: number = performance.now(),
    pointerType = 'unknown',
  ): void {
    if (this.isDestroyed || this.phase !== 'playing') return;

    if (
      this.options.strictWallClock &&
      this.strictDeadlineMs !== null &&
      nowMs >= this.strictDeadlineMs
    ) {
      this.afterDeadlineTapsRejected += 1;
      this.timeLeftMs = 0;
      this.finishGame(nowMs);
      return;
    }

    // Ignore stale, backlogged taps that the browser delivered late after a
    // main-thread jank, so old taps don't "catch up" once the player has lifted
    // their finger (e.g. to collect a mystery box). See STALE_TAP_*_LATENCY_MS.
    if (typeof eventTimeStampMs === 'number') {
      const latency = nowMs - eventTimeStampMs;
      if (latency > STALE_TAP_MIN_LATENCY_MS && latency < STALE_TAP_MAX_LATENCY_MS) {
        this.staleTapsRejected += 1;
        return;
      }
    }

    // Booster prompt hit test (takes priority so an accidental tap on the button
    // edge beneath the prompt still activates the booster, not the tap target).
    if (this.visibleBooster) {
      const { boosterX, boosterY, boosterWidth, boosterHeight } = this.layout;
      if (
        point.x >= boosterX &&
        point.x <= boosterX + boosterWidth &&
        point.y >= boosterY &&
        point.y <= boosterY + boosterHeight
      ) {
        this.activateBooster(this.visibleBooster);
        return;
      }
    }

    // Tap button hit test — allow a 20% larger hit area for mobile feel.
    const dx = point.x - this.layout.tapBtnCx;
    const dy = point.y - this.layout.tapBtnCy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= this.layout.tapBtnRadius * 1.2) {
      this.registerTap(pointerId, point, nowMs, pointerType);
    }
  }

  handlePointerUp(pointerId: number): void {
    this.activePointerIds.delete(pointerId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private registerTap(
    pointerId: number,
    point: { x: number; y: number },
    nowMs: number,
    pointerType: string,
  ): void {
    this.recentTapTimestamps.push(this.gameElapsedMs);
    this.lastTapMs = this.gameElapsedMs;

    const multiplier = this.activeMultiplier ?? 1;
    this.tapCount += 1;
    this.effectiveScore += multiplier;
    this.acceptedTapTimesMs.push(nowMs);
    this.uniquePointerIds.add(pointerId);
    this.activePointerIds.add(pointerId);
    this.maxConcurrentPointers = Math.max(this.maxConcurrentPointers, this.activePointerIds.size);
    const normalizedPointerType = pointerType || 'unknown';
    this.pointerTypeCounts[normalizedPointerType] =
      (this.pointerTypeCounts[normalizedPointerType] ?? 0) + 1;

    if (this.options.lowLatencyInput) {
      // Keep the hot path light enough that the measurement does not create its
      // own event backlog. Canvas feedback still renders on the regular RAF.
      if (this.gameElapsedMs - this.lastLowLatencyUiUpdateMs >= 100) {
        this.lastLowLatencyUiUpdateMs = this.gameElapsedMs;
        this.emitTick();
      }
    } else {
      this.spawnParticles(point.x, point.y);
      this.options.onTap?.();
      this.emitTick();
    }
  }

  private activateBooster(booster: ScheduledBoosterPrompt): void {
    this.visibleBooster = null;

    if (booster.kind === 'time' && typeof booster.timeDelta === 'number') {
      this.timeLeftMs = Math.max(0, this.timeLeftMs + booster.timeDelta * 1000);
      if (this.options.strictWallClock && this.strictDeadlineMs !== null) {
        this.strictDeadlineMs += booster.timeDelta * 1000;
      }
      this.appliedModifiers.push(booster.label);
    } else if (booster.kind === 'multiplier' && typeof booster.multiplier === 'number') {
      this.activeMultiplier = booster.multiplier;
      this.activeMultiplierEndsAtMs = this.gameElapsedMs + booster.activeDuration * 1000;
      this.activeBoosterLabel = booster.label;
    }

    this.options.onBoosterActivated?.(booster.beneficial);
    this.emitTick();
  }

  private spawnParticles(cx: number, cy: number): void {
    const emojiPool = HEAT_EMOJIS[this.heatLevel];
    const count = 1 + this.heatLevel;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = PARTICLE_SPEED * (0.5 + Math.random());
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.12, // slight upward bias
        lifeMs: PARTICLE_LIFE_MS,
        maxLifeMs: PARTICLE_LIFE_MS,
        emoji: emojiPool[Math.floor(Math.random() * emojiPool.length)],
      });
    }
    if (this.particles.length > MAX_PARTICLES) {
      this.particles = this.particles.slice(-MAX_PARTICLES);
    }
  }

  private startPlaying(): void {
    this.phase = 'playing';
    this.playingStartedAtMs = performance.now();
    if (this.options.strictWallClock) {
      this.strictDeadlineMs = this.playingStartedAtMs + this.timeLeftMs;
    }
    this.scheduleBoosterPrompts();
    this.emitTick();
  }

  private scheduleBoosterPrompts(): void {
    const prompts = selectBoosterPrompts(this.options.seed);
    const duration = this.options.duration ?? DEFAULT_DURATION;

    prompts.forEach((prompt) => {
      if (prompt.scheduleAt >= duration) return;

      const showTimeout = setTimeout(() => {
        if (this.isDestroyed || this.phase !== 'playing') return;
        this.visibleBooster = prompt;
        this.emitTick();
      }, prompt.scheduleAt * 1000);

      const hideTimeout = setTimeout(() => {
        if (this.isDestroyed) return;
        if (
          this.visibleBooster?.type === prompt.type &&
          this.visibleBooster?.scheduleAt === prompt.scheduleAt
        ) {
          this.visibleBooster = null;
          this.emitTick();
        }
      }, (prompt.scheduleAt + prompt.visibleFor) * 1000);

      this.boosterTimeouts.push(showTimeout, hideTimeout);
    });
  }

  private finishGame(nowMs: number = performance.now()): void {
    if (this.finishReported) return;
    this.finishReported = true;
    this.phase = 'finished';
    this.isRunning = false;
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.boosterTimeouts.forEach(clearTimeout);
    this.boosterTimeouts.length = 0;
    this.visibleBooster = null;
    this.render();
    const wallClockElapsedMs =
      this.playingStartedAtMs === null ? 0 : Math.max(0, nowMs - this.playingStartedAtMs);
    const intervals = this.acceptedTapTimesMs
      .slice(1)
      .map((time, index) => Math.max(0, time - this.acceptedTapTimesMs[index]))
      .sort((left, right) => left - right);
    let peakOneSecondTaps = 0;
    let windowStart = 0;
    for (let windowEnd = 0; windowEnd < this.acceptedTapTimesMs.length; windowEnd += 1) {
      while (
        this.acceptedTapTimesMs[windowEnd] - this.acceptedTapTimesMs[windowStart] >= 1000
      ) {
        windowStart += 1;
      }
      peakOneSecondTaps = Math.max(peakOneSecondTaps, windowEnd - windowStart + 1);
    }
    const averageTapsPerSecond =
      wallClockElapsedMs > 0 ? this.tapCount / (wallClockElapsedMs / 1000) : 0;
    const medianInterTapMs =
      intervals.length === 0 ? null : intervals[Math.floor(intervals.length / 2)];
    const fastestInterTapMs = intervals.length === 0 ? null : intervals[0];
    const timing: QTRTimingDiagnostics = {
      wallClockElapsedMs,
      longestFrameMs: this.longestFrameMs,
      staleTapsRejected: this.staleTapsRejected,
      afterDeadlineTapsRejected: this.afterDeadlineTapsRejected,
      averageTapsPerSecond: Number(averageTapsPerSecond.toFixed(2)),
      peakOneSecondTaps,
      medianInterTapMs: medianInterTapMs === null ? null : Number(medianInterTapMs.toFixed(1)),
      fastestInterTapMs: fastestInterTapMs === null ? null : Number(fastestInterTapMs.toFixed(1)),
      uniquePointerCount: this.uniquePointerIds.size,
      maxConcurrentPointers: this.maxConcurrentPointers,
      pointerTypeCounts: { ...this.pointerTypeCounts },
      inputRateFlag:
        averageTapsPerSecond > 12 || peakOneSecondTaps > 14 ? 'high-rate-review' : 'typical',
    };
    this.options.onFinish(
      Math.round(this.effectiveScore),
      this.tapCount,
      [...this.appliedModifiers],
      timing,
    );
  }

  private emitTick(): void {
    this.options.onTick(this.getSnapshot());
  }

  // ── RAF loop ────────────────────────────────────────────────────────────────

  private readonly tick = (timestamp: number): void => {
    if (this.isDestroyed || !this.isRunning) {
      this.rafId = 0;
      return;
    }
    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const rawDt = Math.max(0, timestamp - this.lastTimestamp || 16.67);
    this.longestFrameMs = Math.max(this.longestFrameMs, rawDt);
    const dt = Math.min(48, rawDt);
    this.lastTimestamp = timestamp;
    this.update(dt, rawDt);
    this.render();
    if (this.isDestroyed || !this.isRunning) {
      this.rafId = 0;
      return;
    }
    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private update(dt: number, wallDt: number): void {
    if (this.phase === 'countdown') {
      if (this.options.autoStart) {
        this.startPlaying();
        return;
      }
      if (this.countdownGoFramePending) {
        this.countdownGoFramePending = false;
        this.startPlaying();
        return;
      }
      this.countdownElapsedMs += wallDt;
      if (this.countdownElapsedMs >= 1000) {
        this.countdownElapsedMs -= 1000;
        this.countdown = Math.max(0, this.countdown - 1);
        this.emitTick();
        if (this.countdown === 0) {
          this.countdownGoFramePending = true;
        }
      }
    } else if (this.phase === 'playing') {
      this.gameElapsedMs += wallDt;

      // Gameplay follows elapsed wall time even when rendering or rapid input
      // delays a frame. The capped `dt` remains animation-only below.
      this.timeLeftMs = Math.max(0, this.timeLeftMs - wallDt);
      if (this.timeLeftMs <= 0) {
        this.finishGame();
        return;
      }

      // The React HUD lives outside the canvas. Keep its tenths-of-a-second
      // timer moving even when there are no taps or booster state changes.
      if (this.gameElapsedMs - this.lastTimerUiUpdateMs >= 100) {
        this.lastTimerUiUpdateMs = this.gameElapsedMs;
        this.emitTick();
      }

      // Check multiplier expiry.
      if (
        this.activeMultiplierEndsAtMs !== null &&
        this.gameElapsedMs >= this.activeMultiplierEndsAtMs
      ) {
        this.activeMultiplier = null;
        this.activeMultiplierEndsAtMs = null;
        if (this.activeBoosterLabel !== null) {
          this.appliedModifiers.push(this.activeBoosterLabel);
          this.activeBoosterLabel = null;
        }
        this.emitTick();
      }

      // Update heat level.
      const cutoff = this.gameElapsedMs - 2000;
      this.recentTapTimestamps = this.recentTapTimestamps.filter((t) => t >= cutoff);
      this.heatLevel = Math.min(5, Math.floor(this.recentTapTimestamps.length / 2));

      // Advance particles.
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.lifeMs -= dt;
      }
      this.particles = this.particles.filter((p) => p.lifeMs > 0);
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private render(): void {
    if (this.phase === 'countdown') {
      this.renderCountdown();
    } else if (this.phase === 'playing' || this.phase === 'finished') {
      this.renderPlaying();
    }
  }

  private renderCountdown(): void {
    const { ctx, layout } = this;
    const { width, height } = layout;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(15, 15, 25, 0.98)';
    ctx.fillRect(0, 0, width, height);

    // Countdown number.
    const label = this.countdown === 0 ? 'GO!' : String(this.countdown);
    const fontSize = Math.round(Math.min(width, height) * 0.32);
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#7c3aed';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height * 0.44);

    // Hint text.
    const hintSize = Math.max(13, Math.round(width * 0.044));
    ctx.font = `600 ${hintSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#a0a0b8';
    ctx.fillText('Get ready to tap!', width / 2, height * 0.63);
  }

  private renderPlaying(): void {
    const { ctx, layout } = this;
    const { width, height, tapBtnCx, tapBtnCy, tapBtnRadius } = layout;

    ctx.clearRect(0, 0, width, height);

    // Background — heat-tinted.
    ctx.fillStyle = atOrLast(HEAT_BG_COLORS, this.heatLevel);
    ctx.fillRect(0, 0, width, height);

    this.renderHeatDots();

    if (this.visibleBooster) {
      this.renderBoosterPrompt();
    }

    this.renderTapButton(tapBtnCx, tapBtnCy, tapBtnRadius);

    this.renderParticles();
  }

  private renderHeatDots(): void {
    const { ctx, layout } = this;
    const { width, heatDotsY } = layout;

    const dotCount = 6;
    const dotRadius = Math.max(4, Math.round(width * 0.018));
    const dotSpacing = dotRadius * 3;
    const rowWidth = dotCount * dotSpacing;
    const startX = (width - rowWidth) / 2 + dotRadius;

    for (let i = 0; i < dotCount; i++) {
      const cx = startX + i * dotSpacing;
      ctx.beginPath();
      ctx.arc(cx, heatDotsY, dotRadius, 0, Math.PI * 2);
      if (i <= this.heatLevel) {
        ctx.fillStyle = HEAT_DOT_COLORS[i] ?? '#fff';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      }
      ctx.fill();
    }
  }

  private renderBoosterPrompt(): void {
    const { ctx, layout } = this;
    const { boosterX, boosterY, boosterWidth, boosterHeight } = layout;
    const cx = boosterX + boosterWidth / 2;
    const cy = boosterY + boosterHeight / 2;
    const r = 12;
    const pulse =
      BOOSTER_PROMPT_PULSE_BASE
      + Math.sin((this.gameElapsedMs / BOOSTER_PROMPT_PULSE_PERIOD_MS) * Math.PI * 2)
        * BOOSTER_PROMPT_PULSE_AMPLITUDE;
    const glowAlpha = BOOSTER_PROMPT_GLOW_BASE_ALPHA + pulse * BOOSTER_PROMPT_GLOW_PULSE_ALPHA;
    const accent = this.heatLevel >= HIGH_HEAT_THRESHOLD ? '#fb923c' : '#60a5fa';

    // Draw rounded rectangle.
    ctx.beginPath();
    ctx.moveTo(boosterX + r, boosterY);
    ctx.lineTo(boosterX + boosterWidth - r, boosterY);
    ctx.arcTo(boosterX + boosterWidth, boosterY, boosterX + boosterWidth, boosterY + r, r);
    ctx.lineTo(boosterX + boosterWidth, boosterY + boosterHeight - r);
    ctx.arcTo(
      boosterX + boosterWidth,
      boosterY + boosterHeight,
      boosterX + boosterWidth - r,
      boosterY + boosterHeight,
      r,
    );
    ctx.lineTo(boosterX + r, boosterY + boosterHeight);
    ctx.arcTo(boosterX, boosterY + boosterHeight, boosterX, boosterY + boosterHeight - r, r);
    ctx.lineTo(boosterX, boosterY + r);
    ctx.arcTo(boosterX, boosterY, boosterX + r, boosterY, r);
    ctx.closePath();

    ctx.save();
    ctx.shadowColor = `rgba(${BOOSTER_PROMPT_BASE_COLOR_RGB}, ${glowAlpha})`;
    ctx.shadowBlur = BOOSTER_PROMPT_SHADOW_BLUR_BASE + pulse * BOOSTER_PROMPT_SHADOW_BLUR_SCALE;
    ctx.fillStyle = `rgba(${BOOSTER_PROMPT_BASE_COLOR_RGB}, 0.14)`;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Mystery icon.
    const iconSize = Math.min(28, Math.round(boosterHeight * 0.44));
    ctx.font = `${iconSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎁', cx, cy - Math.round(boosterHeight * 0.16));

    // Keep the pickup mysterious so players still have to gamble on whether to tap.
    const labelSize = Math.max(11, Math.round(boosterHeight * 0.22));
    ctx.font = `900 ${labelSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MYSTERY BOOSTER', cx, cy + Math.round(boosterHeight * 0.1));

    // CTA hint.
    const ctaSize = Math.max(9, Math.round(boosterHeight * 0.16));
    ctx.font = `700 ${ctaSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillText('TAP TO GRAB', cx, cy + Math.round(boosterHeight * 0.34));
  }

  private renderTapButton(cx: number, cy: number, radius: number): void {
    const { ctx } = this;
    const btnColor = atOrLast(HEAT_BTN_COLORS, this.heatLevel);

    // Brief press-scale feedback: shrink the button for 120ms after each tap.
    const msSinceTap = this.gameElapsedMs - this.lastTapMs;
    const PRESS_DURATION = 120;
    const pressFraction = msSinceTap < PRESS_DURATION ? 1 - (msSinceTap / PRESS_DURATION) : 0;
    const displayRadius = radius * (1 - 0.08 * pressFraction);

    // Outer glow — more intense at high heat or when pressed.
    ctx.save();
    const glowColor = this.heatLevel >= 4 ? 'rgba(255, 80, 0, 0.5)' : 'rgba(124, 58, 237, 0.45)';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = (16 + this.heatLevel * 8) * (1 - 0.4 * pressFraction);
    ctx.beginPath();
    ctx.arc(cx, cy, displayRadius, 0, Math.PI * 2);
    ctx.fillStyle = btnColor;
    ctx.fill();
    ctx.restore();

    // Button face.
    ctx.beginPath();
    ctx.arc(cx, cy, displayRadius, 0, Math.PI * 2);
    ctx.fillStyle = btnColor;
    ctx.fill();

    // Label.
    const label = this.heatLevel >= 4 ? '💥' : this.heatLevel >= 2 ? '🔥' : 'TAP!';
    const isEmoji = this.heatLevel >= 2;
    const fontSize = isEmoji
      ? Math.round(displayRadius * 0.55)
      : Math.round(displayRadius * 0.38);
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  private renderParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const alpha = p.lifeMs / p.maxLifeMs;
      ctx.globalAlpha = alpha;
      const size = Math.max(10, Math.round(this.layout.width * 0.04));
      ctx.font = `${size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
