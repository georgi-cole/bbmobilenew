import type { ScheduledBoosterPrompt } from '../../../ai/competition/quickTapSimulation';

// ── Phase ─────────────────────────────────────────────────────────────────────

export type QTREnginePhase = 'idle' | 'countdown' | 'playing' | 'finished';

// ── Particles ─────────────────────────────────────────────────────────────────

/** A single emoji particle animated on the canvas. All positions in CSS pixels. */
export interface QTRParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  emoji: string;
}

// ── Layout ────────────────────────────────────────────────────────────────────

/** Cached layout measurements computed from the canvas CSS size + DPR. */
export interface QTRLayout {
  width: number;
  height: number;
  dpr: number;
  tapBtnCx: number;
  tapBtnCy: number;
  tapBtnRadius: number;
  boosterX: number;
  boosterY: number;
  boosterWidth: number;
  boosterHeight: number;
  heatDotsY: number;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/** Immutable view of engine state forwarded to React via onTick. */
export interface QTREngineSnapshot {
  phase: QTREnginePhase;
  /** Countdown value: 3 → 2 → 1 (0 = "GO!" shown just before playing starts). */
  countdown: number;
  /** Seconds remaining in the playing phase. */
  timeLeft: number;
  /** Raw tap count. */
  tapCount: number;
  /** Effective score (raw taps × multiplier, accumulated). */
  effectiveScore: number;
  /** 0–5, derived from taps in last 2 seconds. */
  heatLevel: number;
  /** Currently active tap multiplier, or null when no booster is active. */
  activeMultiplier: number | null;
  /** Booster prompt currently displayed on-canvas, or null. */
  visibleBooster: ScheduledBoosterPrompt | null;
}

export interface QTRTimingDiagnostics {
  wallClockElapsedMs: number;
  longestFrameMs: number;
  staleTapsRejected: number;
  afterDeadlineTapsRejected: number;
  averageTapsPerSecond: number;
  peakOneSecondTaps: number;
  medianInterTapMs: number | null;
  fastestInterTapMs: number | null;
  uniquePointerCount: number;
  maxConcurrentPointers: number;
  pointerTypeCounts: Record<string, number>;
  inputRateFlag: 'typical' | 'high-rate-review';
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface QTREngineOptions {
  seed: number;
  /** Game duration in seconds (default 30). */
  duration?: number;
  /** When true the ready countdown is skipped entirely. */
  autoStart?: boolean;
  /** Dev-lab mode: the deadline follows elapsed wall time even when rendering stalls. */
  strictWallClock?: boolean;
  /** Dev-lab mode: reduce per-tap rendering/audio/state work while measuring input speed. */
  lowLatencyInput?: boolean;
  /** Fired on every meaningful state change. */
  onTick: (snapshot: QTREngineSnapshot) => void;
  /** Fired when the game timer reaches zero. */
  onFinish: (
    finalScore: number,
    rawTaps: number,
    modifiers: string[],
    timing: QTRTimingDiagnostics,
  ) => void;
  /** Audio callback: fired on every player tap. */
  onTap?: () => void;
  /** Audio callback: fired when a booster is activated. */
  onBoosterActivated?: (beneficial: boolean) => void;
}
