import type { CompetitionSkillProfile } from '../../../ai/competition';

export type QuickTapRacePhase =
  | 'ready'
  | 'countdown'
  | 'active'
  | 'finishAnimating'
  | 'completed'
  | 'paused';

export type QuickTapRaceEffectId =
  | 'nitro'
  | 'comboAmp'
  | 'gripLock'
  | 'dragField'
  | 'stumble'
  | 'scramble'
  | 'flashBoost'
  | 'gamble';

export type QuickTapRaceEffectPolarity = 'positive' | 'negative' | 'chaotic';
export type QuickTapRacePickupType = 'booster' | 'gift';

export interface QuickTapRaceParticipantConfig {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  targetScore?: number;
  profile?: CompetitionSkillProfile | null;
}

export interface QuickTapRaceEffectDefinition {
  id: QuickTapRaceEffectId;
  label: string;
  shortLabel: string;
  icon: string;
  polarity: QuickTapRaceEffectPolarity;
  durationMs: number;
  scoreMultiplier?: number;
  comboBonus?: number;
  decayFactor?: number;
  instability?: number;
  grantsShield?: number;
  instantScoreDelta?: [number, number];
}

export interface QuickTapRaceActiveEffect {
  id: QuickTapRaceEffectId;
  label: string;
  shortLabel: string;
  icon: string;
  polarity: QuickTapRaceEffectPolarity;
  remainingMs: number;
  decayFactor: number;
  scoreMultiplier: number;
  comboBonus: number;
  instability: number;
}

export interface QuickTapRacePickupNode {
  id: string;
  type: QuickTapRacePickupType;
  laneIndex: number;
  progress: number;
  effectId: QuickTapRaceEffectId;
  triggered: boolean;
  revealMs: number;
  flash: number;
}

interface QuickTapRaceTapBurstBase {
  radius: number;
  alpha: number;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
}

export interface QuickTapRaceScreenTapBurst extends QuickTapRaceTapBurstBase {
  kind: 'screen';
  x: number;
  y: number;
}

export interface QuickTapRaceTrackTapBurst extends QuickTapRaceTapBurstBase {
  kind: 'track';
  laneIndex: number;
  progress: number;
}

export type QuickTapRaceTapBurst = QuickTapRaceScreenTapBurst | QuickTapRaceTrackTapBurst;

export interface QuickTapRacePickupBurst {
  laneIndex: number;
  progress: number;
  color: string;
  icon: string;
  lifeMs: number;
  maxLifeMs: number;
}

export interface QuickTapRaceAiRuntime {
  baseIntervalMs: number;
  consistency: number;
  burstBias: number;
  nextTapAtMs: number;
  surgeMs: number;
  stumbleMs: number;
  curveExponent: number;
}

export interface QuickTapRaceRacerState {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  laneIndex: number;
  score: number;
  rawTaps: number;
  progress: number;
  velocity: number;
  momentum: number;
  driftOffset: number;
  laneDrift: number;
  bobPhase: number;
  heat: number;
  combo: number;
  shieldCharges: number;
  leadPulse: number;
  pickupGlow: number;
  surgeGlow: number;
  stumbleGlow: number;
  lastScoreGain: number;
  finishMs: number | null;
  activeEffects: QuickTapRaceActiveEffect[];
  pickups: QuickTapRacePickupNode[];
  ai: QuickTapRaceAiRuntime | null;
  profile: CompetitionSkillProfile | null;
  targetScore: number;
}

export interface QuickTapRaceResultEntry {
  id: string;
  name: string;
  score: number;
  rawTaps: number;
  isPlayer: boolean;
  finishMs: number | null;
  progress: number;
}

export interface QuickTapRaceResult {
  seed: number;
  winnerId: string;
  lastPlaceId: string | null;
  humanScore: number;
  humanRawTaps: number;
  scores: Record<string, number>;
  rankings: QuickTapRaceResultEntry[];
}

export interface QuickTapRaceEngineSnapshot {
  phase: QuickTapRacePhase;
  countdownText: string;
  timeLeftMs: number;
  playerScore: number;
  playerRawTaps: number;
  playerCombo: number;
  playerShieldCharges: number;
  playerEffectLabel: string | null;
  playerEffectIcon: string | null;
  playerHeat: number;
  statusText: string;
  leadingRacerId: string | null;
  rankings: QuickTapRaceResultEntry[];
  result: QuickTapRaceResult | null;
  seed: number;
}

export interface QuickTapRaceEngineOptions {
  seed?: number;
  raceDurationMs?: number;
  racers: QuickTapRaceParticipantConfig[];
  onProgress?: (snapshot: QuickTapRaceEngineSnapshot) => void;
  onFinish: (result: QuickTapRaceResult) => void;
  onExit?: () => void;
  reducedMotion?: boolean;
  debug?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaneLayout extends Rect {
  centerX: number;
  centerY: number;
  racerRadius: number;
}

export interface QuickTapRaceLayout {
  width: number;
  height: number;
  dpr: number;
  paddingX: number;
  paddingY: number;
  headerRect: Rect;
  trackRect: Rect;
  tapZoneRect: Rect;
  statusRect: Rect;
  trackStartX: number;
  trackFinishX: number;
  laneGap: number;
  laneHeight: number;
  lanes: LaneLayout[];
}

export interface QuickTapRaceRuntimeState {
  phase: QuickTapRacePhase;
  lastActivePhase: Exclude<QuickTapRacePhase, 'paused'>;
  phaseElapsedMs: number;
  elapsedMs: number;
  timeLeftMs: number;
  countdownMs: number;
  raceDurationMs: number;
  racers: QuickTapRaceRacerState[];
  tapBursts: QuickTapRaceTapBurst[];
  pickupBursts: QuickTapRacePickupBurst[];
  screenPulse: number;
  finishFlash: number;
  cameraShake: number;
  tension: number;
  statusText: string;
  result: QuickTapRaceResult | null;
  lastPointerId: number | null;
}
