import type { GuessResult } from '../../../components/CodeBreakerComp/codeBreakerLogic';

export type VaultCrackerEnginePhase =
  | 'idle'
  | 'active'
  | 'successAnimating'
  | 'failAnimating'
  | 'completed'
  | 'failed'
  | 'paused';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DialSlotLayout extends Rect {
  centerX: number;
  centerY: number;
}

export interface VaultCrackerLayout {
  width: number;
  height: number;
  dpr: number;
  padding: number;
  headerRect: Rect;
  vaultCenterX: number;
  vaultCenterY: number;
  vaultRadius: number;
  vaultInnerRadius: number;
  pressureRadius: number;
  dialSlots: DialSlotLayout[];
  digitRackRect: Rect;
  submitRect: Rect;
  historyRect: Rect;
}

export interface VaultCrackerEngineSnapshot {
  phase: VaultCrackerEnginePhase;
  digits: number[];
  attempts: number;
  elapsedMs: number;
  bestBulls: number;
  lastGuess: GuessResult | null;
  guessHistory: GuessResult[];
  pressure: number;
  validationMessage: string | null;
}

export interface VaultCrackerWinPayload extends VaultCrackerEngineSnapshot {
  secretCode: number[];
}

export interface VaultCrackerLosePayload extends VaultCrackerEngineSnapshot {
  secretCode: number[];
}

export interface VaultCrackerEngineOptions {
  seed: number;
  timeLimitMs?: number;
  onProgress?: (snapshot: VaultCrackerEngineSnapshot) => void;
  onWin?: (payload: VaultCrackerWinPayload) => void;
  onLose?: (payload: VaultCrackerLosePayload) => void;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  radius: number;
  hue: number;
  alpha: number;
}

export interface DialAnimationState {
  offset: number;
  velocity: number;
  glow: number;
}

export interface PointerState {
  pointerId: number | null;
  target: 'dial' | 'submit' | null;
  dialIndex: number | null;
  startY: number;
  lastY: number;
  dragRemainder: number;
  moved: boolean;
}

export interface VaultCrackerRuntimeState {
  phase: VaultCrackerEnginePhase;
  phaseElapsedMs: number;
  elapsedMs: number;
  pressure: number;
  digits: number[];
  guessHistory: GuessResult[];
  lastGuess: GuessResult | null;
  bestBulls: number;
  secretCode: number[];
  timerStarted: boolean;
  timeLimitMs: number | null;
  idleMotion: number;
  pulse: number;
  rejectPulse: number;
  successPulse: number;
  shake: number;
  glow: number;
  dialAnimations: DialAnimationState[];
  particles: Particle[];
  pointer: PointerState;
  submitPressed: boolean;
  validationMessage: string | null;
}
