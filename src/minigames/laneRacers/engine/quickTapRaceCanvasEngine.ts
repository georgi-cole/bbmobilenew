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

const DEFAULT_DURATION_MS = 30_000;
const COUNTDOWN_MS = 3_200;
const FINISH_ANIMATION_MS = 1_500;
const PROGRESS_EMIT_INTERVAL_MS = 100;
const FINISH_SCORE = 225;
const MAX_ACTIVE_EFFECTS = 2;
const PLAYER_BASE_GAIN = 1.4;
const AI_SCORE_CALIBRATION_FACTOR = 1.12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeColor(color: string, fallback: string): string {
  return color.trim().length > 0 ? color : fallback;
}

function formatOrdinal(rank: number): string {
  const place = rank + 1;
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function buildAiRuntime(seed: number, targetScore: number): QuickTapRaceAiRuntime {
  const rng = mulberry32(seed);
  // Tune target-score pacing so the visual race lands near the existing competitive
  // Quick Tap score envelope without forcing identical AI cadence every run.
  const tapsPerSecond = clamp(targetScore / DEFAULT_DURATION_MS * 1000 / AI_SCORE_CALIBRATION_FACTOR, 3.6, 8.8);
  return {
    baseIntervalMs: 1000 / tapsPerSecond,
    consistency: 0.74 + rng() * 0.22,
    burstBias: 0.85 + rng() * 0.36,
    nextTapAtMs: 120 + rng() * 240,
    surgeMs: 0,
    stumbleMs: 0,
    curveExponent: 0.9 + rng() * 0.26,
  };
}

function buildPickups(seed: number, laneIndex: number): QuickTapRacePickupNode[] {
  const rng = mulberry32(seed ^ ((laneIndex + 1) * 0x9e3779b9));
  const positions = [0.22 + rng() * 0.1, 0.48 + rng() * 0.08, 0.74 + rng() * 0.12]
    .map((value) => clamp(value, 0.15, 0.9));

  return positions.map((progress, pickupIndex) => {
    const type = pickupIndex === 1 ? 'gift' : rng() > 0.3 ? 'booster' : 'gift';
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
      if (b.score !== a.score) return b.score - a.score;
      if (b.progress !== a.progress) return b.progress - a.progress;
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
    statusText: state.statusText,
    leadingRacerId,
    rankings,
    result: state.result,
    seed,
  };
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
    // Deterministic seed is allowed for tests/debugging, but gameplay defaults to
    // auto-reseed so each race feels fresh. In this codebase, seed === 0 is also
    // treated as “no explicit seed”, matching the existing minigame convention.
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
    this.state.statusText = this.state.phase === 'active' ? 'Back in the race' : 'Get ready';
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
    // CSS controls the displayed canvas size (see QuickTapRaceCanvasGame's bounded
    // .qtr__arena-shell / .qtr__canvas styles); canvas.width / canvas.height only set
    // the internal pixel buffer so high-DPI rendering stays crisp without resizing the parent.
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

  private createInitialState(): QuickTapRaceRuntimeState {
    const fallbackColors = ['#38bdf8', '#f97316', '#f43f5e', '#22c55e', '#facc15', '#a855f7'];
    const racers = this.options.racers.map((participant, index) => ({
      id: participant.id,
      name: participant.name,
      isPlayer: participant.isPlayer,
      color: normalizeColor(participant.color, fallbackColors[index % fallbackColors.length]),
      laneIndex: index,
      score: 0,
      rawTaps: 0,
      progress: 0,
      targetProgress: 0,
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
    }));

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
      statusText: 'Lights up… racers ready',
      result: null,
      lastPointerId: null,
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
    this.progressEmitElapsed += deltaMs;

    this.state.tapBursts = this.state.tapBursts.filter((burst) => {
      burst.lifeMs -= deltaMs;
      burst.radius += deltaMs * 0.04;
      burst.alpha = Math.max(0, burst.lifeMs / burst.maxLifeMs);
      return burst.lifeMs > 0;
    });

    this.state.pickupBursts = this.state.pickupBursts.filter((burst) => {
      burst.lifeMs -= deltaMs;
      return burst.lifeMs > 0;
    });

    this.state.racers.forEach((racer) => {
      racer.bobPhase += deltaMs * 0.004 + racer.leadPulse * 0.005;
      racer.pickupGlow = Math.max(0, racer.pickupGlow - deltaMs / 650);
      racer.leadPulse = Math.max(0, racer.leadPulse - deltaMs / 800);
      racer.surgeGlow = Math.max(0, racer.surgeGlow - deltaMs / 900);
      racer.stumbleGlow = Math.max(0, racer.stumbleGlow - deltaMs / 700);
      racer.heat = Math.max(0, racer.heat - deltaMs / 2400);
      racer.combo = Math.max(0, racer.combo - deltaMs * 0.00075 * this.getDecayFactor(racer));
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
      this.state.statusText = this.state.countdownMs > 900 ? 'Feel the countdown' : 'Go! Go! Go!';
      if (this.state.phaseElapsedMs >= COUNTDOWN_MS) {
        this.enterPhase('active', 'Tap rhythm matters immediately');
      }
    } else if (this.state.phase === 'active') {
      this.state.elapsedMs += deltaMs;
      this.state.timeLeftMs = Math.max(0, this.state.raceDurationMs - this.state.elapsedMs);
      this.updateAiRacers(deltaMs);
      this.updateProgressFromScores();
      this.checkLanePickups();
      this.updateStatusText();
      if (this.state.timeLeftMs <= 0) {
        this.completeRace();
      }
    } else if (this.state.phase === 'finishAnimating') {
      this.updateProgressFromScores();
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
      const expectedScore = racer.targetScore * Math.pow(elapsedRatio, ai.curveExponent);
      const scoreError = expectedScore - racer.score;
      const desiredCadenceBoost = clamp(scoreError / 24, -0.22, 0.35);

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

        const tapGainBase = 0.96 + this.rng() * 0.42 + desiredCadenceBoost * 0.6 + ai.burstBias * 0.1;
        this.applyScoreGain(racer, tapGainBase, false);
      }
    }
  }

  private applyPlayerTap(x: number, y: number): void {
    const player = this.state.racers.find((candidate) => candidate.isPlayer);
    if (!player) return;

    const tapZone = this.layout.tapZoneRect;
    const tapX = clamp(x, tapZone.x + 24, tapZone.x + tapZone.width - 24);
    const tapY = clamp(y, tapZone.y + 18, tapZone.y + tapZone.height - 18);

    player.rawTaps += 1;
    player.combo = clamp(player.combo + 0.52, 0, 8);
    player.heat = clamp(player.heat + 0.18, 0, 1);
    player.surgeGlow = Math.max(player.surgeGlow, 0.55);
    player.leadPulse = Math.max(player.leadPulse, 0.18);
    this.state.screenPulse = Math.min(1, this.state.screenPulse + 0.18);
    this.state.cameraShake = Math.min(1, this.state.cameraShake + 0.12);

    const burstColor = player.color;
    this.state.tapBursts.push({
      x: tapX,
      y: tapY,
      radius: 12,
      alpha: 1,
      lifeMs: 360,
      maxLifeMs: 360,
      color: burstColor,
    });

    this.applyScoreGain(player, PLAYER_BASE_GAIN + player.combo * 0.08, true);
    this.updateProgressFromScores();
    this.checkLanePickups();
    this.updateStatusText();
    this.emitProgress();
  }

  private applyScoreGain(racer: QuickTapRaceRacerState, baseGain: number, isPlayerTap: boolean): void {
    const effects = racer.activeEffects;
    const multiplier = effects.reduce((product, effect) => product * effect.scoreMultiplier, 1);
    const comboBonus = effects.reduce((sum, effect) => sum + effect.comboBonus, 0);
    const instability = effects.reduce((sum, effect) => sum + effect.instability, 0);
    const instabilityFactor = instability > 0 ? 1 + (this.rng() * 2 - 1) * instability : 1;
    const comboFactor = 1 + clamp(racer.combo * 0.05 + comboBonus * 0.08, 0, 0.65);
    const gain = Math.max(0.3, baseGain * multiplier * comboFactor * instabilityFactor);
    racer.score += gain;
    racer.lastScoreGain = gain;

    if (isPlayerTap) {
      racer.leadPulse = Math.min(1, racer.leadPulse + 0.1);
    }

    const finishThresholdReached = racer.finishMs === null && racer.score >= FINISH_SCORE;
    if (finishThresholdReached) {
      racer.finishMs = this.state.elapsedMs;
      racer.surgeGlow = 1;
      this.state.finishFlash = Math.max(this.state.finishFlash, 0.45);
    }
  }

  private updateProgressFromScores(): void {
    const leaderScore = Math.max(...this.state.racers.map((racer) => racer.score), 1);

    for (const racer of this.state.racers) {
      const baseTarget = clamp(racer.score / FINISH_SCORE, 0, 1);
      const extraStretch = racer.finishMs !== null ? 0.04 : 0;
      racer.targetProgress = clamp(baseTarget + extraStretch, 0, 1.02);
      const followSpeed = racer.isPlayer ? 0.22 : 0.16;
      racer.progress += (racer.targetProgress - racer.progress) * followSpeed;
      racer.progress = clamp(racer.progress, 0, 1.02);
      racer.leadPulse = leaderScore > 0 ? clamp(racer.score / leaderScore - 0.75, 0, 0.45) + racer.leadPulse : racer.leadPulse;
    }
  }

  private checkLanePickups(): void {
    for (const racer of this.state.racers) {
      for (const pickup of racer.pickups) {
        if (pickup.triggered || racer.progress < pickup.progress) continue;
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
      this.state.statusText = `${racer.name} blocked ${definition.shortLabel}`;
    } else {
      const activeEffect = createActiveEffect(pickup.effectId);
      const instantDelta = definition.instantScoreDelta;
      if (instantDelta) {
        racer.score = Math.max(0, racer.score + instantDelta[0] + this.rng() * (instantDelta[1] - instantDelta[0]));
      }
      if (definition.grantsShield) {
        racer.shieldCharges += definition.grantsShield;
      }
      racer.activeEffects = [activeEffect, ...racer.activeEffects].slice(0, MAX_ACTIVE_EFFECTS);
      racer.pickupGlow = 1;
      racer.surgeGlow = definition.polarity === 'negative' ? racer.surgeGlow : Math.max(racer.surgeGlow, 0.5);
      racer.stumbleGlow = definition.polarity === 'negative' ? 0.8 : racer.stumbleGlow;
      if (racer.isPlayer) {
        this.state.statusText =
          pickup.type === 'gift'
            ? `${definition.label} revealed!`
            : `${definition.label} activated!`;
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
    this.updateProgressFromScores();
  }

  private getDecayFactor(racer: QuickTapRaceRacerState): number {
    return racer.activeEffects.reduce((value, effect) => value * effect.decayFactor, 1);
  }

  private updateStatusText(): void {
    const rankings = sortRankings(this.state.racers);
    const leader = rankings[0];
    const playerEntry = rankings.find((entry) => entry.isPlayer) ?? rankings[0];
    const livePlayer = this.state.racers.find((entry) => entry.isPlayer) ?? this.state.racers[0];
    const playerRank = rankings.findIndex((entry) => entry.isPlayer) + 1;

    if (this.state.timeLeftMs <= 6_000) {
      const playerPlacement = playerRank === 1 ? 'hold it' : `you are ${formatOrdinal(playerRank - 1)}`;
      this.state.statusText = `${leader?.name ?? 'Leader'} leads — ${playerPlacement}`;
      return;
    }

    if (livePlayer.activeEffects[0]) {
      this.state.statusText = `${livePlayer.activeEffects[0].label} live • ${Math.round(playerEntry.score)} pts`;
      return;
    }

    this.state.statusText = playerRank === 1
      ? 'You are pacing the field'
      : `${leader?.name ?? 'Leader'} ahead • ${Math.round((leader?.score ?? 0) - playerEntry.score)} pts gap`;
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
