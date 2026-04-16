import { mulberry32 } from '../../../store/rng';
import { cryptoSeed } from '../../../features/riskWheel/cryptoSpin';
import { buildQuickTapRaceLayout } from './layout';
import { BOOSTER_EFFECT_IDS, createActiveEffect, EFFECT_DEFINITIONS, GIFT_EFFECT_IDS } from './effects';
import { drawBackground } from './renderBackground';
import { drawEffects } from './renderEffects';
import { drawRacers } from './renderRacers';
import { drawTrack } from './renderTrack';
import { drawUiOverlays } from './renderUi';
import type {
  QuickTapRaceAiRuntime,
  QuickTapRaceEngineOptions,
  QuickTapRaceEngineSnapshot,
  QuickTapRaceLayout,
  QuickTapRacePickupBurst,
  QuickTapRacePickupNode,
  QuickTapRaceResult,
  QuickTapRaceResultEntry,
  QuickTapRaceRacerState,
  QuickTapRaceRuntimeState,
} from './types';

const DEFAULT_DURATION_MS = 60_000;
const COUNTDOWN_MS = 3_200;
const FINISH_ANIMATION_MS = 1_500;
const PROGRESS_EMIT_INTERVAL_MS = 100;
const FINISH_SCORE = 225;
const MAX_ACTIVE_EFFECTS = 2;
const PLAYER_TAP_IMPULSE = 0.0038;
const AI_TAP_IMPULSE = 0.0031;
const COMBO_IMPULSE_MULTIPLIER = 0.00038;
const BASE_PLAYER_CRUISE = 0.0028;
const BASE_AI_CRUISE = 0.0032;
const AI_TARGET_SCORE_NORMALIZATION = 60_000;
const MAX_SPEED = 0.05;
const MIN_SPEED = 0.0024;
const MOMENTUM_DECAY_PER_SECOND = 1.75;
const PICKUP_DODGE_WINDOW_MS = 2_200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(color: string, fallback: string): string {
  return color.trim().length > 0 ? color : fallback;
}

function buildAiRuntime(seed: number, targetScore: number): QuickTapRaceAiRuntime {
  const rng = mulberry32(seed);
  const tapsPerSecond = clamp(targetScore / DEFAULT_DURATION_MS * 1000 / 1.05, 3.6, 8.6);
  return {
    baseIntervalMs: 1000 / tapsPerSecond,
    consistency: 0.74 + rng() * 0.22,
    burstBias: 0.85 + rng() * 0.36,
    nextTapAtMs: 120 + rng() * 240,
    surgeMs: 0,
    stumbleMs: 0,
    curveExponent: 0.92 + rng() * 0.24,
  };
}

function buildPickups(seed: number, laneIndex: number): QuickTapRacePickupNode[] {
  const rng = mulberry32(seed ^ ((laneIndex + 1) * 0x9e3779b9));
  const positions = [0.18 + rng() * 0.06, 0.38 + rng() * 0.08, 0.61 + rng() * 0.08, 0.82 + rng() * 0.05]
    .map((value) => clamp(value, 0.14, 0.92));

  return positions.map((progress, pickupIndex) => {
    const type = pickupIndex % 2 === 1 ? 'gift' : rng() > 0.28 ? 'booster' : 'gift';
    const effectIds = type === 'gift' ? GIFT_EFFECT_IDS : BOOSTER_EFFECT_IDS;
    const effectId = effectIds[Math.floor(rng() * effectIds.length)];
    return {
      id: `lane-${laneIndex}-${pickupIndex}`,
      laneIndex,
      progress,
      type,
      effectId,
      triggered: false,
      revealMs: 0,
      flash: 0,
    };
  });
}

function sortRankings(racers: QuickTapRaceRacerState[]): QuickTapRaceResultEntry[] {
  return racers
    .map((racer) => ({
      id: racer.id,
      name: racer.name,
      score: Math.round(racer.score),
      rawTaps: racer.rawTaps,
      isPlayer: racer.isPlayer,
      finishMs: racer.finishMs,
      progress: racer.progress,
    }))
    .sort((a, b) => {
      const aFinished = a.finishMs !== null;
      const bFinished = b.finishMs !== null;
      if (aFinished && bFinished) {
        return (a.finishMs ?? Number.POSITIVE_INFINITY) - (b.finishMs ?? Number.POSITIVE_INFINITY);
      }
      if (aFinished !== bFinished) {
        return aFinished ? -1 : 1;
      }
      if (b.progress !== a.progress) return b.progress - a.progress;
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });
}

function buildSnapshot(state: QuickTapRaceRuntimeState, seed: number): QuickTapRaceEngineSnapshot {
  const player = state.racers.find((candidate) => candidate.isPlayer) ?? state.racers[0];
  const rankings = sortRankings(state.racers);
  const leadingRacerId = rankings[0]?.id ?? null;
  const primaryEffect = player?.activeEffects[0] ?? null;

  let countdownText = '';
  if (state.phase === 'countdown') {
    countdownText = state.countdownMs > 800 ? String(Math.ceil(state.countdownMs / 1000)) : 'GO';
  }

  return {
    phase: state.phase,
    countdownText,
    timeLeftMs: state.timeLeftMs,
    playerScore: Math.round(player?.score ?? 0),
    playerRawTaps: player?.rawTaps ?? 0,
    playerCombo: Math.max(0, Math.round((player?.combo ?? 0) * 10) / 10),
    playerShieldCharges: player?.shieldCharges ?? 0,
    playerEffectLabel: primaryEffect?.label ?? null,
    playerEffectIcon: primaryEffect?.icon ?? null,
    playerHeat: Math.round((player?.heat ?? 0) * 100) / 100,
    playerPickupDodgeMs: state.playerPickupDodgeMs,
    statusText: state.statusText,
    leadingRacerId,
    rankings,
    result: state.result,
    seed,
  };
}

function getBaselineCruiseSpeed(racer: Pick<QuickTapRaceRacerState, 'isPlayer' | 'targetScore'>): number {
  if (racer.isPlayer) {
    return BASE_PLAYER_CRUISE;
  }

  return BASE_AI_CRUISE + clamp(racer.targetScore / AI_TARGET_SCORE_NORMALIZATION, 0, 0.0036);
}

export class QuickTapRaceCanvasEngine {
  private readonly canvas: HTMLCanvasElement;

  private readonly ctx: CanvasRenderingContext2D;

  private readonly options: QuickTapRaceEngineOptions;

  private readonly seed: number;

  private readonly rng: () => number;

  private state: QuickTapRaceRuntimeState;

  private layout: QuickTapRaceLayout;

  private rafId: number | null = null;

  private lastFrameTime = 0;

  private destroyed = false;

  private finishFired = false;

  private progressEmitElapsed = 0;

  constructor(canvas: HTMLCanvasElement, options: QuickTapRaceEngineOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for Lane Racers.');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.options = options;
    this.seed = options.seed === undefined || options.seed === 0 ? cryptoSeed() : options.seed;
    this.rng = mulberry32(this.seed ^ 0x4d595df4);
    this.layout = buildQuickTapRaceLayout(360, 620, 1, options.racers.length);
    this.state = this.createInitialState();
  }

  start(): void {
    if (this.destroyed || this.rafId !== null) return;
    this.lastFrameTime = performance.now();
    this.queueFrame();
    this.emitProgress();
  }

  pause(): void {
    if (this.state.phase === 'paused' || this.destroyed) return;
    this.state.lastActivePhase = this.state.phase;
    this.state.phase = 'paused';
    this.state.statusText = 'Paused';
    this.emitProgress();
  }

  resume(): void {
    if (this.destroyed || this.state.phase !== 'paused') return;
    this.state.phase = this.state.lastActivePhase;
    this.state.statusText = this.state.phase === 'active' ? 'Engines hot again' : 'Get ready';
    this.lastFrameTime = performance.now();
    this.emitProgress();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resize(width: number, height: number, dpr: number): void {
    const safeWidth = Math.round(width);
    const safeHeight = Math.round(height);
    const safeDpr = clamp(dpr || 1, 1, 3);

    if (
      this.layout.width === safeWidth
      && this.layout.height === safeHeight
      && this.layout.dpr === safeDpr
    ) {
      return;
    }

    this.layout = buildQuickTapRaceLayout(safeWidth, safeHeight, safeDpr, this.state.racers.length);
    this.canvas.width = Math.round(safeWidth * safeDpr);
    this.canvas.height = Math.round(safeHeight * safeDpr);
  }

  getSnapshot(): QuickTapRaceEngineSnapshot {
    return buildSnapshot(this.state, this.seed);
  }

  getSeed(): number {
    return this.seed;
  }

  handlePointerTap(pointerId: number, point: { x: number; y: number }): void {
    if (this.state.lastPointerId !== null && this.state.lastPointerId !== pointerId) {
      return;
    }
    this.state.lastPointerId = pointerId;
    if (this.state.phase !== 'active') return;
    this.applyPlayerTap(point.x, point.y);
  }

  handlePointerRelease(pointerId: number): void {
    if (this.state.lastPointerId === pointerId) {
      this.state.lastPointerId = null;
    }
  }

  handleControlTap(): void {
    if (this.state.phase !== 'active') return;
    const tapZone = this.layout.tapZoneRect;
    this.applyPlayerTap(tapZone.x + tapZone.width * 0.5, tapZone.y + tapZone.height * 0.5);
  }

  armPickupDodge(): void {
    if (this.state.phase !== 'active') return;
    this.state.playerPickupDodgeMs = Math.max(this.state.playerPickupDodgeMs, PICKUP_DODGE_WINDOW_MS);
    this.state.statusText = 'Dodge armed — skip the next pickup';
    this.emitProgress();
  }

  private createInitialState(): QuickTapRaceRuntimeState {
    const fallbackColors = ['#38bdf8', '#f97316', '#f43f5e', '#22c55e', '#facc15', '#a855f7'];
    const racers = this.options.racers.map((participant, index) => {
      const baseline = getBaselineCruiseSpeed({
        isPlayer: participant.isPlayer,
        targetScore: participant.targetScore ?? 180,
      });
      return {
        id: participant.id,
        name: participant.name,
        isPlayer: participant.isPlayer,
        color: normalizeColor(participant.color, fallbackColors[index % fallbackColors.length]),
        laneIndex: index,
        score: 0,
        rawTaps: 0,
        progress: 0,
        velocity: baseline * (0.92 + this.rng() * 0.16),
        momentum: 0,
        driftOffset: 0,
        laneDrift: this.rng() * Math.PI * 2,
        bobPhase: this.rng() * Math.PI * 2,
        heat: 0,
        combo: 0,
        shieldCharges: 0,
        leadPulse: 0,
        pickupGlow: 0,
        surgeGlow: 0,
        stumbleGlow: 0,
        lastScoreGain: 0,
        finishMs: null,
        activeEffects: [],
        pickups: buildPickups(this.seed, index),
        ai: participant.isPlayer ? null : buildAiRuntime(this.seed ^ (index + 17), participant.targetScore ?? 180),
        profile: participant.profile ?? null,
        targetScore: participant.targetScore ?? 0,
      } satisfies QuickTapRaceRacerState;
    });

    return {
      phase: 'countdown',
      lastActivePhase: 'countdown',
      phaseElapsedMs: 0,
      elapsedMs: 0,
      timeLeftMs: this.options.raceDurationMs ?? DEFAULT_DURATION_MS,
      countdownMs: COUNTDOWN_MS,
      raceDurationMs: this.options.raceDurationMs ?? DEFAULT_DURATION_MS,
      racers,
      tapBursts: [],
      pickupBursts: [],
      screenPulse: 0,
      finishFlash: 0,
      cameraShake: 0,
      tension: 0,
      statusText: 'Lights up… hold for the launch',
      result: null,
      lastPointerId: null,
      playerPickupDodgeMs: 0,
    };
  }

  private queueFrame(): void {
    this.rafId = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  private tick(timestamp: number): void {
    if (this.destroyed) return;

    const deltaMs = clamp(timestamp - this.lastFrameTime, 0, 50);
    this.lastFrameTime = timestamp;

    this.update(deltaMs);
    this.render();

    if (!this.destroyed) {
      this.queueFrame();
    }
  }

  private update(deltaMs: number): void {
    this.state.phaseElapsedMs += deltaMs;
    this.state.screenPulse = Math.max(0, this.state.screenPulse - deltaMs / 700);
    this.state.finishFlash = Math.max(0, this.state.finishFlash - deltaMs / 650);
    this.state.cameraShake = Math.max(0, this.state.cameraShake - deltaMs / 500);
    this.state.playerPickupDodgeMs = Math.max(0, this.state.playerPickupDodgeMs - deltaMs);
    this.progressEmitElapsed += deltaMs;

    this.state.tapBursts = this.state.tapBursts.filter((burst) => {
      burst.lifeMs -= deltaMs;
      burst.radius += deltaMs * 0.05;
      burst.alpha = Math.max(0, burst.lifeMs / burst.maxLifeMs);
      return burst.lifeMs > 0;
    });

    this.state.pickupBursts = this.state.pickupBursts.filter((burst) => {
      burst.lifeMs -= deltaMs;
      return burst.lifeMs > 0;
    });

    this.state.racers.forEach((racer) => {
      racer.bobPhase += deltaMs * 0.004 + racer.velocity * 18;
      racer.pickupGlow = Math.max(0, racer.pickupGlow - deltaMs / 650);
      racer.leadPulse = Math.max(0, racer.leadPulse - deltaMs / 800);
      racer.surgeGlow = Math.max(0, racer.surgeGlow - deltaMs / 900);
      racer.stumbleGlow = Math.max(0, racer.stumbleGlow - deltaMs / 700);
      racer.heat = Math.max(0, racer.heat - deltaMs / 2500);
      racer.combo = Math.max(0, racer.combo - deltaMs * 0.00072 * this.getDecayFactor(racer));
      racer.activeEffects = racer.activeEffects.filter((effect) => {
        effect.remainingMs -= deltaMs;
        return effect.remainingMs > 0;
      });
      racer.pickups.forEach((pickup) => {
        pickup.flash = Math.max(0, pickup.flash - deltaMs / 600);
        pickup.revealMs = Math.max(0, pickup.revealMs - deltaMs);
      });
    });

    if (this.state.phase === 'paused') {
      if (this.progressEmitElapsed >= PROGRESS_EMIT_INTERVAL_MS) {
        this.progressEmitElapsed = 0;
        this.emitProgress();
      }
      return;
    }

    if (this.state.phase === 'countdown') {
      this.state.countdownMs = Math.max(0, COUNTDOWN_MS - this.state.phaseElapsedMs);
      this.state.statusText = this.state.countdownMs > 900 ? 'Engines spooling up' : 'Punch it!';
      if (this.state.phaseElapsedMs >= COUNTDOWN_MS) {
        this.enterPhase('active', 'Race live — build momentum');
      }
    } else if (this.state.phase === 'active') {
      this.state.elapsedMs += deltaMs;
      this.state.timeLeftMs = Math.max(0, this.state.raceDurationMs - this.state.elapsedMs);
      this.updateAiRacers(deltaMs);
      this.updateRacerMotion(deltaMs);
      this.checkLanePickups();
      this.updateScoresFromRaceState();
      this.updateStatusText();
      if (this.state.racers.some((racer) => racer.finishMs !== null) || this.state.timeLeftMs <= 0) {
        this.completeRace();
      }
    } else if (this.state.phase === 'finishAnimating') {
      this.updateRacerMotion(deltaMs, true);
      this.updateScoresFromRaceState();
      if (this.state.phaseElapsedMs >= FINISH_ANIMATION_MS) {
        this.enterPhase('completed', 'Results locked');
        this.fireFinishIfNeeded();
      }
    }

    if (this.progressEmitElapsed >= PROGRESS_EMIT_INTERVAL_MS) {
      this.progressEmitElapsed = 0;
      this.emitProgress();
    }
  }

  private updateAiRacers(deltaMs: number): void {
    for (const racer of this.state.racers) {
      if (racer.isPlayer || racer.ai === null) continue;

      const ai = racer.ai;
      ai.surgeMs = Math.max(0, ai.surgeMs - deltaMs);
      ai.stumbleMs = Math.max(0, ai.stumbleMs - deltaMs);

      const elapsedRatio = clamp(this.state.elapsedMs / this.state.raceDurationMs, 0, 1);
      const expectedProgress = Math.pow(elapsedRatio, ai.curveExponent);
      const progressError = expectedProgress - racer.progress;
      const desiredCadenceBoost = clamp(progressError * 1.8, -0.22, 0.38);

      if (ai.surgeMs <= 0 && this.rng() < deltaMs / 5400 * ai.burstBias) {
        ai.surgeMs = 700 + this.rng() * 850;
        racer.surgeGlow = 1;
      }
      if (ai.stumbleMs <= 0 && this.rng() < deltaMs / 7200 * (1.05 - ai.consistency)) {
        ai.stumbleMs = 260 + this.rng() * 450;
        racer.stumbleGlow = 1;
      }

      while (ai.nextTapAtMs <= this.state.elapsedMs) {
        const jitter = (this.rng() * 2 - 1) * (1.1 - ai.consistency) * 0.45;
        const surgeFactor = ai.surgeMs > 0 ? 0.82 : 1;
        const stumbleFactor = ai.stumbleMs > 0 ? 1.3 : 1;
        const interval = ai.baseIntervalMs * (1 - desiredCadenceBoost) * (1 + jitter) * surgeFactor * stumbleFactor;
        ai.nextTapAtMs += clamp(interval, 82, 340);

        const impulse = AI_TAP_IMPULSE
          + this.rng() * 0.0014
          + desiredCadenceBoost * 0.0028
          + ai.burstBias * 0.0005;
        this.applyDriveImpulse(racer, impulse, false);
      }
    }
  }

  private updateRacerMotion(deltaMs: number, settling = false): void {
    const deltaSeconds = deltaMs / 1000;

    for (const racer of this.state.racers) {
      const effectMultiplier = this.getEffectSpeedMultiplier(racer);
      const instability = this.getInstability(racer);
      const baseline = getBaselineCruiseSpeed(racer);
      const comboDrive = clamp(racer.combo * 0.0009, 0, 0.007);
      const heatDrive = racer.heat * 0.0018;
      const microVariation = Math.sin(this.state.elapsedMs * 0.0022 + racer.laneDrift) * 0.0014
        + Math.cos(this.state.elapsedMs * 0.0014 + racer.bobPhase) * 0.0008;
      const instabilityJitter = instability > 0 ? (this.rng() * 2 - 1) * 0.0025 * instability : 0;

      racer.momentum *= Math.exp(-deltaSeconds * MOMENTUM_DECAY_PER_SECOND * this.getDecayFactor(racer));
      if (settling) {
        racer.momentum *= 0.92;
      }

      const targetVelocity = clamp(
        (baseline + racer.momentum + comboDrive + heatDrive + microVariation + instabilityJitter) * effectMultiplier,
        MIN_SPEED,
        MAX_SPEED,
      );
      racer.velocity += (targetVelocity - racer.velocity) * clamp(deltaSeconds * 8.5, 0, 1);
      racer.progress = clamp(racer.progress + racer.velocity * deltaSeconds, 0, 1);

      const driftTarget = Math.sin(racer.bobPhase) * (2 + racer.velocity * 110 + racer.surgeGlow * 3.5);
      racer.driftOffset += (driftTarget - racer.driftOffset) * clamp(deltaSeconds * 7, 0, 1);

      if (racer.finishMs === null && racer.progress >= 1) {
        racer.progress = 1;
        racer.finishMs = this.state.elapsedMs;
        racer.surgeGlow = 1;
        this.state.finishFlash = Math.max(this.state.finishFlash, 0.45);
      }
    }
  }

  private applyPlayerTap(x: number, y: number): void {
    const player = this.state.racers.find((candidate) => candidate.isPlayer);
    if (!player) return;

    const tapZone = this.layout.tapZoneRect;
    if (x < tapZone.x || x > tapZone.x + tapZone.width || y < tapZone.y || y > tapZone.y + tapZone.height) {
      return;
    }

    const tapX = clamp(x, tapZone.x + 24, tapZone.x + tapZone.width - 24);
    const tapY = clamp(y, tapZone.y + 18, tapZone.y + tapZone.height - 18);

    player.rawTaps += 1;
    player.combo = clamp(player.combo + 0.5, 0, 8);
    player.heat = clamp(player.heat + 0.18, 0, 1);
    player.surgeGlow = Math.max(player.surgeGlow, 0.55);
    player.leadPulse = Math.max(player.leadPulse, 0.18);
    this.state.screenPulse = Math.min(1, this.state.screenPulse + 0.18);
    this.state.cameraShake = Math.min(1, this.state.cameraShake + 0.12);

    this.state.tapBursts.push({
      kind: 'screen',
      x: tapX,
      y: tapY,
      radius: 12,
      alpha: 0.7,
      lifeMs: 260,
      maxLifeMs: 260,
      color: player.color,
    });
    this.state.tapBursts.push({
      kind: 'track',
      laneIndex: player.laneIndex,
      progress: player.progress,
      radius: 14,
      alpha: 1,
      lifeMs: 340,
      maxLifeMs: 340,
      color: player.color,
    });

    const comboImpulse = PLAYER_TAP_IMPULSE + player.combo * COMBO_IMPULSE_MULTIPLIER;
    this.applyDriveImpulse(player, comboImpulse, true);
    this.updateScoresFromRaceState();
    this.checkLanePickups();
    this.updateStatusText();
    this.emitProgress();
  }

  private applyDriveImpulse(racer: QuickTapRaceRacerState, baseImpulse: number, isPlayerTap: boolean): void {
    const effectMultiplier = this.getEffectSpeedMultiplier(racer);
    const comboBonus = racer.activeEffects.reduce((sum, effect) => sum + effect.comboBonus, 0);
    const comboFactor = 1 + clamp(racer.combo * 0.03 + comboBonus * 0.06, 0, 0.5);
    const impulse = Math.max(0.0015, baseImpulse * effectMultiplier * comboFactor);
    racer.momentum = clamp(racer.momentum + impulse, 0, 0.11);
    racer.lastScoreGain = impulse * FINISH_SCORE * 3.4;

    if (isPlayerTap) {
      racer.leadPulse = Math.min(1, racer.leadPulse + 0.1);
    }
  }

  private updateScoresFromRaceState(): void {
    const leaderProgress = Math.max(...this.state.racers.map((racer) => racer.progress), 0);
    const timePressure = clamp(1 - this.state.timeLeftMs / 6_000, 0, 1);
    this.state.tension = Math.max(clamp((leaderProgress - 0.76) / 0.2, 0, 1), timePressure);

    for (const racer of this.state.racers) {
      const distanceScore = racer.progress * FINISH_SCORE;
      const tapBonus = Math.min(34, racer.rawTaps * 0.42);
      const comboBonus = Math.min(18, racer.combo * 2.6);
      const finishBonus = racer.finishMs !== null ? 12 : 0;
      racer.score = Math.max(racer.score, distanceScore + tapBonus + comboBonus + finishBonus);
      if (leaderProgress > 0) {
        racer.leadPulse = Math.max(
          racer.leadPulse,
          clamp((racer.progress / leaderProgress - 0.88) * 1.5, 0, 0.6),
        );
      }
    }
  }

  private checkLanePickups(): void {
    for (const racer of this.state.racers) {
      for (const pickup of racer.pickups) {
        if (pickup.triggered || racer.progress < pickup.progress) continue;
        if (racer.isPlayer && this.state.playerPickupDodgeMs > 0) {
          pickup.triggered = true;
          pickup.flash = 1;
          pickup.revealMs = 700;
          racer.pickupGlow = 1;
          racer.surgeGlow = Math.max(racer.surgeGlow, 0.25);
          this.state.playerPickupDodgeMs = 0;
          this.state.pickupBursts.push({
            laneIndex: racer.laneIndex,
            progress: pickup.progress,
            color: '#e2e8f0',
            icon: '↷',
            lifeMs: 650,
            maxLifeMs: 650,
          });
          continue;
        }
        pickup.triggered = true;
        pickup.flash = 1;
        pickup.revealMs = 1100;
        this.resolvePickup(racer, pickup);
      }
    }
  }

  private resolvePickup(racer: QuickTapRaceRacerState, pickup: QuickTapRacePickupNode): void {
    const definition = EFFECT_DEFINITIONS[pickup.effectId];
    const blocked = definition.polarity === 'negative' && racer.shieldCharges > 0;

    if (blocked) {
      racer.shieldCharges -= 1;
      racer.pickupGlow = 1;
      racer.surgeGlow = Math.max(racer.surgeGlow, 0.35);
      racer.momentum = clamp(racer.momentum + 0.004, 0, 0.11);
      this.state.statusText = `${racer.name} blocked ${definition.shortLabel}`;
    } else {
      const activeEffect = createActiveEffect(pickup.effectId);
      const instantDelta = definition.instantScoreDelta;
      let progressDelta = 0;
      let momentumDelta = 0;

      if (instantDelta) {
        progressDelta += (instantDelta[0] + this.rng() * (instantDelta[1] - instantDelta[0])) / FINISH_SCORE * 0.18;
      }

      if (definition.polarity === 'positive') {
        momentumDelta += 0.011 + this.rng() * 0.004;
        progressDelta += 0.012 + this.rng() * 0.012;
      } else if (definition.polarity === 'negative') {
        momentumDelta -= 0.009 + this.rng() * 0.004;
        progressDelta -= 0.015 + this.rng() * 0.01;
      } else {
        const lucky = this.rng() > 0.42;
        momentumDelta += lucky ? 0.01 + this.rng() * 0.004 : -(0.007 + this.rng() * 0.004);
        progressDelta += lucky ? 0.012 + this.rng() * 0.012 : -(0.01 + this.rng() * 0.01);
      }

      racer.progress = clamp(racer.progress + progressDelta, 0, 1);
      racer.momentum = clamp(racer.momentum + momentumDelta, 0, 0.11);
      if (definition.grantsShield) {
        racer.shieldCharges += definition.grantsShield;
      }
      racer.activeEffects = [activeEffect, ...racer.activeEffects].slice(0, MAX_ACTIVE_EFFECTS);
      racer.pickupGlow = 1;
      racer.surgeGlow = definition.polarity === 'negative' ? racer.surgeGlow : Math.max(racer.surgeGlow, 0.6);
      racer.stumbleGlow = definition.polarity === 'negative' ? 0.9 : racer.stumbleGlow;
      if (racer.isPlayer) {
        this.state.statusText = pickup.type === 'gift'
          ? `${definition.label} cracked open!`
          : `${definition.label} engaged!`;
      }
    }

    const burstColor =
      definition.polarity === 'positive'
        ? '#4ade80'
        : definition.polarity === 'negative'
          ? '#fb7185'
          : '#facc15';
    const burst: QuickTapRacePickupBurst = {
      laneIndex: racer.laneIndex,
      progress: pickup.progress,
      color: burstColor,
      icon: blocked ? '🛡️' : definition.icon,
      lifeMs: 750,
      maxLifeMs: 750,
    };
    this.state.pickupBursts.push(burst);
    this.state.screenPulse = Math.min(1, this.state.screenPulse + 0.22);
    this.state.cameraShake = Math.min(1, this.state.cameraShake + 0.18);
  }

  private getDecayFactor(racer: QuickTapRaceRacerState): number {
    return racer.activeEffects.reduce((value, effect) => value * effect.decayFactor, 1);
  }

  private getEffectSpeedMultiplier(racer: QuickTapRaceRacerState): number {
    return racer.activeEffects.reduce((value, effect) => value * clamp(effect.scoreMultiplier, 0.72, 1.42), 1);
  }

  private getInstability(racer: QuickTapRaceRacerState): number {
    return racer.activeEffects.reduce((sum, effect) => sum + effect.instability, 0);
  }

  private updateStatusText(): void {
    const rankings = sortRankings(this.state.racers);
    const leader = rankings[0];
    const playerEntry = rankings.find((entry) => entry.isPlayer) ?? rankings[0];
    const livePlayer = this.state.racers.find((entry) => entry.isPlayer) ?? this.state.racers[0];
    const playerRank = rankings.findIndex((entry) => entry.isPlayer) + 1;
    const gapMeters = Math.max(0, Math.round(((leader?.progress ?? 0) - playerEntry.progress) * 100));

    if (leader?.finishMs !== null) {
      this.state.statusText = leader.id === playerEntry.id ? 'You hit the line first!' : `${leader.name} hit the line first`;
      return;
    }

    if (this.state.tension > 0.82) {
      this.state.statusText = playerRank === 1
        ? 'Hold the line — finish is right there'
        : `${leader?.name ?? 'Leader'} is ${gapMeters}m ahead`;
      return;
    }

    if (livePlayer.activeEffects[0]) {
      this.state.statusText = `${livePlayer.activeEffects[0].label} live • ${Math.round(playerEntry.score)} pts`;
      return;
    }

    if (this.state.playerPickupDodgeMs > 0) {
      this.state.statusText = 'Dodge armed • next pickup will be skipped';
      return;
    }

    if (playerRank === 1) {
      const second = rankings[1];
      const cushion = Math.max(0, Math.round((playerEntry.progress - (second?.progress ?? 0)) * 100));
      this.state.statusText = cushion > 0 ? `You lead by ${cushion}m` : 'You are pacing the field';
      return;
    }

    this.state.statusText = `${leader?.name ?? 'Leader'} ahead • ${gapMeters}m gap`;
  }

  private completeRace(): void {
    if (this.state.result) return;
    const rankings = sortRankings(this.state.racers);
    const human = rankings.find((entry) => entry.isPlayer) ?? rankings[0];
    const winnerId = rankings[0]?.id ?? human.id;
    const lastPlaceId = rankings.length > 1 ? rankings[rankings.length - 1].id : null;
    const scores = Object.fromEntries(rankings.map((entry) => [entry.id, entry.score]));
    this.state.result = {
      seed: this.seed,
      winnerId,
      lastPlaceId,
      humanScore: human.score,
      humanRawTaps: human.rawTaps,
      scores,
      rankings,
    } satisfies QuickTapRaceResult;
    this.state.finishFlash = 1;
    this.enterPhase('finishAnimating', `${rankings[0]?.name ?? 'Winner'} takes the race`);
    this.emitProgress();
  }

  private fireFinishIfNeeded(): void {
    if (this.finishFired || !this.state.result) return;
    this.finishFired = true;
    this.options.onFinish(this.state.result);
  }

  private enterPhase(nextPhase: QuickTapRaceRuntimeState['phase'], statusText: string): void {
    this.state.phase = nextPhase;
    this.state.lastActivePhase = nextPhase === 'paused' ? this.state.lastActivePhase : nextPhase;
    this.state.phaseElapsedMs = 0;
    this.state.statusText = statusText;
  }

  private emitProgress(): void {
    this.options.onProgress?.(buildSnapshot(this.state, this.seed));
  }

  private render(): void {
    const ctx = this.ctx;
    const { dpr } = this.layout;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.state.cameraShake > 0.01) {
      const offsetX = (this.rng() * 2 - 1) * this.state.cameraShake * 3.5;
      const offsetY = (this.rng() * 2 - 1) * this.state.cameraShake * 2.4;
      ctx.translate(offsetX, offsetY);
    }

    drawBackground(ctx, this.state, this.layout);
    drawTrack(ctx, this.state, this.layout);
    drawRacers(ctx, this.state, this.layout);
    drawEffects(ctx, this.state, this.layout);
    drawUiOverlays(ctx, this.state, this.layout);
  }
}
