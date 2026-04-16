import {
  CODE_LENGTH,
  evaluateGuess,
  generateSecretCode,
  type GuessResult,
} from '../../../components/CodeBreakerComp/codeBreakerLogic';
import { clamp, modulo } from '../utils/math';
import { createVaultCrackerLayout } from './layout';
import { hitTestTarget } from './input';
import { computeVaultCrackerPressure } from './pressure';
import { renderBackground } from './renderBackground';
import { renderEffects } from './renderEffects';
import { renderIndicators } from './renderIndicators';
import { renderVault } from './renderVault';
import { isInteractivePhase, setPhase } from './stateMachine';
import type {
  Particle,
  PointerState,
  VaultCrackerEngineOptions,
  VaultCrackerEngineSnapshot,
  VaultCrackerLayout,
  VaultCrackerRuntimeState,
  VaultCrackerWinPayload,
} from './types';

const DRAG_STEP_PX = 24;
const SUCCESS_ANIMATION_MS = 1_500;
const FAIL_ANIMATION_MS = 420;

function makePointerState(): PointerState {
  return {
    pointerId: null,
    target: null,
    dialIndex: null,
    startY: 0,
    lastY: 0,
    dragRemainder: 0,
    moved: false,
  };
}

function makeParticle(x: number, y: number, hue: number, spread = 1): Particle {
  const angle = Math.random() * Math.PI * 2;
  const speed = (0.04 + Math.random() * 0.1) * spread;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    lifeMs: 320 + Math.random() * 380,
    maxLifeMs: 320 + Math.random() * 380,
    radius: 1.8 + Math.random() * 2.6,
    hue,
    alpha: 0.75 + Math.random() * 0.2,
  };
}

function makeInitialState(seed: number, timeLimitMs?: number): VaultCrackerRuntimeState {
  return {
    phase: 'idle',
    phaseElapsedMs: 0,
    elapsedMs: 0,
    pressure: 0.06,
    digits: Array(CODE_LENGTH).fill(0),
    guessHistory: [],
    lastGuess: null,
    bestBulls: 0,
    secretCode: generateSecretCode(seed),
    timerStarted: false,
    timeLimitMs: timeLimitMs && timeLimitMs > 0 ? timeLimitMs : null,
    idleMotion: 0,
    pulse: 0.35,
    rejectPulse: 0,
    successPulse: 0,
    shake: 0,
    glow: 0.24,
    dialAnimations: Array.from({ length: CODE_LENGTH }, () => ({
      offset: 0,
      velocity: 0,
      glow: 0,
    })),
    particles: [],
    pointer: makePointerState(),
    submitPressed: false,
  };
}

export class VaultCrackerCanvasEngine {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private readonly options: VaultCrackerEngineOptions;

  private readonly state: VaultCrackerRuntimeState;

  private layout: VaultCrackerLayout;

  private rafId = 0;

  private lastTimestamp = 0;

  private isRunning = false;

  private isDestroyed = false;

  private winReported = false;

  private loseReported = false;

  private lastProgressSecond = -1;

  constructor(canvas: HTMLCanvasElement, options: VaultCrackerEngineOptions) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Vault Cracker canvas could not acquire a 2D context.');
    }

    this.canvas = canvas;
    this.ctx = context;
    this.options = options;
    this.state = makeInitialState(options.seed, options.timeLimitMs);
    this.layout = createVaultCrackerLayout(canvas.clientWidth || 320, canvas.clientHeight || 560, 1);
  }

  start(): void {
    if (this.isDestroyed || this.rafId !== 0) return;
    if (this.state.phase === 'idle') {
      setPhase(this.state, 'active');
    }
    this.isRunning = true;
    this.lastTimestamp = 0;
    this.render();
    this.rafId = window.requestAnimationFrame(this.tick);
    this.emitProgress(true);
  }

  pause(): void {
    this.isRunning = false;
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.state.phase !== 'completed' && this.state.phase !== 'failed') {
      setPhase(this.state, 'paused');
    }
  }

  resume(): void {
    if (this.isDestroyed || this.rafId !== 0) return;
    if (this.state.phase === 'paused') {
      setPhase(this.state, 'active');
    }
    this.isRunning = true;
    this.lastTimestamp = 0;
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.rafId !== 0) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.isDestroyed = true;
    this.state.pointer = makePointerState();
  }

  resize(width: number, height: number, dpr: number): void {
    if (this.isDestroyed || width <= 0 || height <= 0) return;
    this.layout = createVaultCrackerLayout(width, height, dpr);
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  getSnapshot(): VaultCrackerEngineSnapshot {
    return this.makeSnapshot();
  }

  handlePointerDown(pointerId: number, point: { x: number; y: number }): void {
    if (this.isDestroyed || this.state.pointer.pointerId !== null || !isInteractivePhase(this.state.phase)) {
      return;
    }
    const target = hitTestTarget(this.layout, point);
    if (!target) return;

    this.ensureTimerStarted();
    this.state.pointer = {
      pointerId,
      target: target.kind,
      dialIndex: target.kind === 'dial' ? target.index : null,
      startY: point.y,
      lastY: point.y,
      dragRemainder: 0,
      moved: false,
    };
    this.state.submitPressed = target.kind === 'submit';
  }

  handlePointerMove(pointerId: number, point: { x: number; y: number }): void {
    if (this.isDestroyed || this.state.pointer.pointerId !== pointerId) return;
    if (this.state.pointer.target !== 'dial' || this.state.pointer.dialIndex === null) return;

    const deltaY = point.y - this.state.pointer.lastY;
    this.state.pointer.lastY = point.y;
    this.state.pointer.dragRemainder += deltaY;
    if (Math.abs(point.y - this.state.pointer.startY) > 4) {
      this.state.pointer.moved = true;
    }

    while (this.state.pointer.dragRemainder <= -DRAG_STEP_PX) {
      this.state.pointer.dragRemainder += DRAG_STEP_PX;
      this.adjustDigit(this.state.pointer.dialIndex, 1, true);
    }
    while (this.state.pointer.dragRemainder >= DRAG_STEP_PX) {
      this.state.pointer.dragRemainder -= DRAG_STEP_PX;
      this.adjustDigit(this.state.pointer.dialIndex, -1, true);
    }
  }

  handlePointerUp(pointerId: number, point: { x: number; y: number }): void {
    if (this.isDestroyed || this.state.pointer.pointerId !== pointerId) return;
    const pointer = this.state.pointer;

    if (pointer.target === 'dial' && pointer.dialIndex !== null && !pointer.moved) {
      const slot = this.layout.dialSlots[pointer.dialIndex];
      const delta = point.y <= slot.centerY ? 1 : -1;
      this.adjustDigit(pointer.dialIndex, delta, false);
    }

    if (pointer.target === 'submit' && hitTestTarget(this.layout, point)?.kind === 'submit') {
      this.submitGuess();
    }

    this.state.pointer = makePointerState();
    this.state.submitPressed = false;
  }

  handlePointerCancel(pointerId: number): void {
    if (this.state.pointer.pointerId !== pointerId) return;
    this.state.pointer = makePointerState();
    this.state.submitPressed = false;
  }

  private readonly tick = (timestamp: number) => {
    if (this.isDestroyed || !this.isRunning) {
      this.rafId = 0;
      return;
    }
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
    }
    const rawDt = Math.max(0, timestamp - this.lastTimestamp || 16.67);
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

  private update(dt: number, elapsedDt: number): void {
    const state = this.state;
    state.phaseElapsedMs += dt;
    state.idleMotion += dt;

    if (state.timerStarted && state.phase !== 'completed' && state.phase !== 'failed') {
      state.elapsedMs += elapsedDt;
      if (state.timeLimitMs !== null && state.elapsedMs >= state.timeLimitMs) {
        state.elapsedMs = state.timeLimitMs;
        this.failGame();
      }
    }

    state.pressure = computeVaultCrackerPressure({
      attempts: state.guessHistory.length,
      bestBulls: state.bestBulls,
      elapsedMs: state.elapsedMs,
      timeLimitMs: state.timeLimitMs,
    });

    state.pulse = clamp(state.pulse + dt * 0.00018, 0.2, 1);
    state.rejectPulse = Math.max(0, state.rejectPulse - dt * 0.0032);
    state.successPulse = Math.max(0, state.successPulse - dt * 0.0014);
    state.shake = Math.max(0, state.shake - dt * 0.0035);
    state.glow = clamp(state.glow * 0.992 + state.successPulse * 0.012 + 0.002, 0.18, 1.15);

    state.dialAnimations.forEach((animation) => {
      animation.offset += animation.velocity * dt;
      animation.velocity *= 0.88;
      animation.offset *= 0.84;
      animation.glow = Math.max(0, animation.glow - dt * 0.0018);
    });

    state.particles = state.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * dt,
        y: particle.y + particle.vy * dt,
        vy: particle.vy + dt * 0.00012,
        lifeMs: particle.lifeMs - dt,
      }))
      .filter((particle) => particle.lifeMs > 0);

    if (state.phase === 'successAnimating' && state.phaseElapsedMs >= SUCCESS_ANIMATION_MS) {
      setPhase(state, 'completed');
      this.emitProgress(true);
    }

    if (state.phase === 'failAnimating' && state.phaseElapsedMs >= FAIL_ANIMATION_MS) {
      setPhase(state, 'active');
      this.emitProgress(true);
    }

    this.emitProgress(false);
  }

  private render(): void {
    this.ctx.clearRect(0, 0, this.layout.width, this.layout.height);
    renderBackground(this.ctx, this.state, this.layout);
    renderVault(this.ctx, this.state, this.layout);
    renderIndicators(this.ctx, this.state, this.layout);
    renderEffects(this.ctx, this.state, this.layout);
  }

  private ensureTimerStarted(): void {
    if (!this.state.timerStarted) {
      this.state.timerStarted = true;
      if (this.state.phase === 'idle') {
        setPhase(this.state, 'active');
      }
    }
  }

  private adjustDigit(index: number, delta: number, fromDrag: boolean): void {
    if (!isInteractivePhase(this.state.phase)) return;
    this.ensureTimerStarted();
    this.state.digits[index] = modulo(this.state.digits[index] + delta, 10);
    this.state.pulse = 0.22;
    this.state.glow = clamp(this.state.glow + 0.07, 0.18, 1.12);
    this.state.dialAnimations[index].offset += delta * (fromDrag ? 9 : 14);
    this.state.dialAnimations[index].velocity += delta * (fromDrag ? 0.0065 : 0.011);
    this.state.dialAnimations[index].glow = 1;
  }

  private submitGuess(): void {
    if (!isInteractivePhase(this.state.phase)) return;
    this.ensureTimerStarted();

    const guess = [...this.state.digits];
    const result = evaluateGuess(this.state.secretCode, guess);
    this.state.lastGuess = result;
    this.state.guessHistory = [...this.state.guessHistory, result];
    this.state.bestBulls = Math.max(this.state.bestBulls, result.bulls);

    if (result.bulls === CODE_LENGTH) {
      this.handleWin(result);
      return;
    }

    this.state.rejectPulse = 1;
    this.state.shake = 1;
    this.state.glow = clamp(this.state.glow + 0.02, 0.18, 1.15);
    setPhase(this.state, 'failAnimating');
    this.spawnBurst(this.layout.vaultCenterX, this.layout.vaultCenterY, 10, 6);
    this.emitProgress(true);
  }

  private handleWin(result: GuessResult): void {
    this.state.lastGuess = result;
    this.state.successPulse = 1.2;
    this.state.glow = 1.15;
    this.state.shake = 0;
    setPhase(this.state, 'successAnimating');
    this.spawnBurst(this.layout.vaultCenterX, this.layout.vaultCenterY, 14, 152);
    if (!this.winReported) {
      this.winReported = true;
      const payload: VaultCrackerWinPayload = {
        ...this.makeSnapshot(),
        phase: 'successAnimating',
        secretCode: [...this.state.secretCode],
      };
      this.options.onWin?.(payload);
    }
    this.emitProgress(true);
  }

  private failGame(): void {
    if (this.loseReported) return;
    this.loseReported = true;
    this.state.rejectPulse = 1;
    this.state.shake = 1;
    setPhase(this.state, 'failed');
    this.options.onLose?.({
      ...this.makeSnapshot(),
      phase: 'failed',
      secretCode: [...this.state.secretCode],
    });
    this.emitProgress(true);
  }

  private spawnBurst(x: number, y: number, count: number, hue: number): void {
    const particles = Array.from({ length: count }, () => makeParticle(x, y, hue, 1.1));
    this.state.particles = [...this.state.particles, ...particles].slice(-48);
  }

  private makeSnapshot(): VaultCrackerEngineSnapshot {
    return {
      phase: this.state.phase,
      digits: [...this.state.digits],
      attempts: this.state.guessHistory.length,
      elapsedMs: Math.round(this.state.elapsedMs),
      bestBulls: this.state.bestBulls,
      lastGuess: this.state.lastGuess ? { ...this.state.lastGuess, digits: [...this.state.lastGuess.digits] } : null,
      guessHistory: this.state.guessHistory.map((guess) => ({ ...guess, digits: [...guess.digits] })),
      pressure: this.state.pressure,
    };
  }

  private emitProgress(force: boolean): void {
    const second = Math.floor(this.state.elapsedMs / 1000);
    if (!force && second === this.lastProgressSecond) return;
    this.lastProgressSecond = second;
    this.options.onProgress?.(this.makeSnapshot());
  }
}
