/**
 * GlassBridgeComp — "The Crystal Path" elimination minigame.
 *
 * Players cross a path of paired crystal platforms one row at a time.
 * One wrong choice = elimination.  Broken platforms persist for later players.
 * Winner is determined by fastest completion or furthest progress.
 *
 * Phases (driven by Redux state):
 *   order_selection  — Players pick unique numbers; AI auto-picks.
 *   order_reveal     — Shuffled order displayed with animation.
 *   playing          — Sequential turn-based path crossing.
 *   complete         — Final rankings shown; onComplete fires.
 *
 * Human flow:
 *   - Pick a number during order selection.
 *   - During your turn: tap the highlighted platform in the active row to step.
 *   - Request Help (up to 3×) to get a probabilistic hint from The Expert (+30s penalty each).
 *   - If eliminated: spectator modal offers "Continue Watching" or "Skip to Result".
 *
 * AI flow:
 *   - Auto-picks order numbers.
 *   - Auto-steps with realistic delay using decision logic from glassBridgeSlice.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initGlassBridge,
  recordNumberChoice,
  finaliseOrderSelection,
  startPlaying,
  startParallelPlayers,
  resolveParallelStep,
  resolveStep,
  expireTimer,
  completeGame,
  setHumanSpectating,
  resetGlassBridge,
  aiDecideStep,
  recordHintUsed,
  selectActivePlayerId,
  selectIsGameOver,
  HINT_PENALTY_MS,
  MAX_HINTS_PER_RUN,
  shouldStartParallelPlayers,
  chooseParallelAiSide,
  type BridgeRow,
  type TileSide,
} from '../../features/glassBridge/glassBridgeSlice';
import { resolveGlassBridgeOutcome } from '../../features/glassBridge/thunks';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { mulberry32 } from '../../store/rng';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import './GlassBridgeComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Delay after order selection complete before revealing. */
const ORDER_REVEAL_DELAY_MS = 600;
/** Delay per item in the order reveal animation (staggered). */
const REVEAL_STAGGER_MS = 350;
/** Auto-advance from reveal to playing (after all items shown). */
const REVEAL_TO_PLAY_DELAY_MS = 1_800;
const AI_UNKNOWN_ROW_DELAY_MIN_MS = 100;
const AI_UNKNOWN_ROW_DELAY_MAX_MS = 3_000;
const AI_REVEALED_ROW_DELAY_MIN_MS = 350;
const AI_REVEALED_ROW_DELAY_MAX_MS = 1_750;
const AI_OBVIOUS_SAFE_DELAY_MIN_MS = 100;
const AI_OBVIOUS_SAFE_DELAY_MAX_MS = 1_000;
/** Shatter animation duration (ms). Aligned with CSS animation. */
const SHATTER_ANIM_MS = 400;
/** Pause after shatter before advancing turn. */
const POST_SHATTER_DELAY_MS = 300;
/** Suspense pause after selecting a tile before the outcome resolves. */
const STEP_SUSPENSE_DELAY_MS = 260;
/** Delay between AI number picks while the human has NOT yet chosen (ms). */
const ORDER_AI_PICK_SLOW_MS = 2_500;
/** Delay between AI number picks after the human has chosen (ms). */
const ORDER_AI_PICK_FAST_MS = 350;
/** Duration of the death flash overlay (ms). Aligned with gb-elim-flash (0.12s). */
const DEATH_FLASH_MS = 120;
/** How long the death marker (skull) stays visible before fully fading (ms). Aligned with gb-death-fade (0.75s). */
const DEATH_MARKER_DURATION_MS = 750;
/** Landing animation duration for a finisher reaching the safe platform (ms). Aligned with gb-player-land (0.55s), plus a short grace period. */
const LANDING_ANIM_DURATION_MS = 600;
/** Stagger between timeout-triggered bridge rows collapsing. */
const TIMEOUT_ROW_BREAK_STAGGER_MS = 60;
/** Small offset so the two tiles in a row do not break at the exact same moment. */
const TIMEOUT_SIDE_BREAK_OFFSET_MS = 24;
/** Keeps 1–2 letter initials comfortably inside the circular fallback avatars. */
const AVATAR_INITIALS_FONT_SIZE_RATIO = 0.42;
const STATUS_FLASH_MS = 1_900;
const STATUS_FLASH_SHORT_MS = 950;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve a player's avatar URL: real photo → Dicebear fallback. */
function avatarForId(id: string, name?: string): string {
  const displayName = name ?? id;
  return resolveAvatar({ id, name: displayName, avatar: '' });
}

function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map(part => part.charAt(0).toUpperCase()).join('');
}

interface GlassBridgeAvatarProps {
  id: string;
  name: string;
  size: number;
  alt: string;
}

function GlassBridgeAvatar({ id, name, size, alt }: GlassBridgeAvatarProps) {
  const [avatarSrc, setAvatarSrc] = useState(() => avatarForId(id, name));
  const [showInitials, setShowInitials] = useState(false);
  const initials = useMemo(() => initialsForName(name), [name]);

  function handleError() {
    const dicebear = getDicebear(name);
    if (avatarSrc !== dicebear) {
      setAvatarSrc(dicebear);
      return;
    }
    setShowInitials(true);
  }

  if (showInitials) {
    return (
      <span
        className="gb-avatar-fallback"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.round(size * AVATAR_INITIALS_FONT_SIZE_RATIO)),
        }}
        role="img"
        aria-label={alt}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={avatarSrc}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={handleError}
    />
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

function formatTimeRemaining(remaining: number): string {
  if (remaining <= 0) return '0:00';
  return formatElapsed(remaining);
}

function areAnimationsDisabled(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('no-animations');
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getTimeoutCollapseDuration(rowsCount: number, noAnimations: boolean): number {
  if (noAnimations) return 0;
  const finalTileDelay = Math.max(0, rowsCount - 1) * TIMEOUT_ROW_BREAK_STAGGER_MS
    + TIMEOUT_SIDE_BREAK_OFFSET_MS;
  return finalTileDelay + SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS;
}

/**
 * Compute the tiered certainty hint shown by The Expert.
 *
 * Returns the integer percentage chance that the LEFT platform will break,
 * with stronger repeat requests on the same row becoming increasingly certain.
 *
 * Repeated hints on the same row intentionally become much more certain:
 *  - 1st hint: 65% / 35%
 *  - 2nd hint: 90% / 10%
 *  - 3rd hint: 99% / 1%
 */
function computeHintLeftBreakChance(safeSide: TileSide, sameRowHintCount: number): number {
  // Convert the 1-based repeated-hint count into a 0-based tier index
  // while clamping invalid/overflow values into the three supported tiers.
  const tierIndex = Math.min(MAX_HINTS_PER_RUN - 1, Math.max(0, sameRowHintCount - 1));
  const leftBreakChanceByTier = safeSide === 'right'
    ? [65, 90, 99]
    : [35, 10, 1];
  return leftBreakChanceByTier[tierIndex];
}

function getHintUses(hintPenaltyMs: number | undefined): number {
  return Math.min(
    MAX_HINTS_PER_RUN,
    Math.floor((hintPenaltyMs ?? 0) / HINT_PENALTY_MS),
  );
}

function getAiDecisionDelayMs(
  row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'>,
  rng: () => number,
): number {
  const [minDelay, maxDelay] = row.leftBroken !== row.rightBroken
    ? [AI_OBVIOUS_SAFE_DELAY_MIN_MS, AI_OBVIOUS_SAFE_DELAY_MAX_MS]
    : row.revealedSafeSide
      ? [AI_REVEALED_ROW_DELAY_MIN_MS, AI_REVEALED_ROW_DELAY_MAX_MS]
      : [AI_UNKNOWN_ROW_DELAY_MIN_MS, AI_UNKNOWN_ROW_DELAY_MAX_MS];
  return minDelay + Math.floor(rng() * (maxDelay - minDelay));
}

function shouldAiUseHint(
  rowIdx: number,
  rowsCount: number,
  hintsUsed: number,
  rng: () => number,
): boolean {
  if (hintsUsed >= MAX_HINTS_PER_RUN) return false;
  const rowPressure = rowIdx / Math.max(1, rowsCount - 1);
  // Base 18% chance, with pressure increasing as the bridge gets deeper and a
  // small extra bump after prior hint usage. Cap at 62% so AI still guess
  // naturally instead of over-optimizing every unknown row.
  const chance = Math.min(0.62, 0.18 + rowPressure * 0.34 + hintsUsed * 0.06);
  return rng() < chance;
}

function chooseSideFromHint(safeSide: TileSide, sameRowHintCount: number, rng: () => number): TileSide {
  const leftBreakChance = computeHintLeftBreakChance(safeSide, sameRowHintCount);
  const safeChance = safeSide === 'left'
    ? (100 - leftBreakChance) / 100
    : leftBreakChance / 100;
  return rng() < safeChance
    ? safeSide
    : safeSide === 'left'
      ? 'right'
      : 'left';
}

function getNextPlaybackSpeed(currentSpeed: 1 | 2 | 3): 1 | 2 | 3 {
  if (currentSpeed === 1) return 2;
  if (currentSpeed === 2) return 3;
  return 1;
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(max-width: 640px)').matches;
  }
  return window.innerWidth <= 640;
}

function formatHintUsage(hintUses: number): string {
  return `${hintUses} hint${hintUses === 1 ? '' : 's'}`;
}

function hasOneBrokenTile(row: Pick<BridgeRow, 'leftBroken' | 'rightBroken'>): boolean {
  return row.leftBroken !== row.rightBroken;
}

function getCompletionBannerMessage(
  isHuman: boolean,
  isRecord: boolean,
  name: string,
  time: string,
): string {
  if (isHuman) {
    return isRecord
      ? pickRandom(humanNewRecordMessages)(time)
      : pickRandom(humanFinishMessages)(time);
  }

  return isRecord
    ? pickRandom(newRecordMessages)(name, time)
    : pickRandom(finishMessages)(name, time);
}

function getBrokenPlatformFallMessage(isHuman: boolean, name: string): string {
  return isHuman
    ? pickRandom(humanBrokenPlatformFallMessages)
    : pickRandom(brokenPlatformFallMessages)(name);
}

// ─── Randomized status-bar message pools ─────────────────────────────────────

/** Pick a random element from a non-empty array on each call. */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const expertHintUsedMessages: ReadonlyArray<(name: string) => string> = [
  name => `${name} consults The Expert.`,
  name => `${name} calls upon The Expert.`,
  name => `${name} seeks the oracle's guidance.`,
];

const hintMessages: ReadonlyArray<(chance: number) => string> = [
  chance => `The Expert whispers: ${chance}% chance the left platform will shatter.`,
  chance => `The Expert foresees doom — ${chance}% chance the left side breaks.`,
  chance => `The crystal oracle warns: ${chance}% chance the left platform collapses.`,
];

const aiCrashMessages: ReadonlyArray<(name: string, row: number) => string> = [
  (name, row) => `${name} is swallowed by the void on row ${row}.`,
  (name, row) => `The path gives way beneath ${name} on row ${row}.`,
  (name, row) => `${name} falls as the crystal shatters on row ${row}.`,
];

const aiClearMessages: ReadonlyArray<(name: string, row: number) => string> = [
  (name, row) => `${name} survives row ${row}.`,
  (name, row) => `${name} crosses row ${row} unbroken.`,
  (name, row) => `Row ${row} yields to ${name}.`,
];

const humanCrashMessages: ReadonlyArray<(row: number) => string> = [
  row => `You are claimed by the abyss on row ${row}.`,
  row => `The crystal breaks beneath you on row ${row}.`,
  row => `You fall as row ${row} shatters.`,
];

const humanClearMessages: ReadonlyArray<(row: number) => string> = [
  row => `You survive row ${row}.`,
  row => `You cross row ${row} unbroken.`,
  row => `Row ${row} yields to you.`,
];

const brokenPlatformFallMessages: ReadonlyArray<(name: string) => string> = [
  name => `${name} slips onto the broken platform.`,
  name => `${name} loses balance and falls through the broken platform.`,
  name => `${name} stumbles and drops through the hole in the path.`,
];

const humanBrokenPlatformFallMessages: ReadonlyArray<string> = [
  'You slip onto the broken platform.',
  'You lose balance and fall through the broken platform.',
  'You stumble and drop through the hole in the path.',
];

const timesUpMessages: ReadonlyArray<string> = [
  "Time is over. The path is collapsing.",
  "The clock has died — the path is collapsing!",
  "No time remains. The bridge is breaking apart!",
];

const stepPromptMessages: ReadonlyArray<string> = [
  "Choose wisely. One step decides the fall.",
  "Select a platform before the path takes you.",
  "Step carefully — the crystal remembers every mistake.",
];

const activePlayerMessages: ReadonlyArray<(name: string) => string> = [
  name => `${name} stands before the abyss.`,
  name => `${name} faces the crystal trial.`,
  name => `${name} walks the path of judgment.`,
];

const waitingMessages: ReadonlyArray<string> = [
  "The path waits in silence.",
  "The crystal stands ready for the next soul.",
  "Another player must face the bridge.",
];

const newRecordMessages: ReadonlyArray<(name: string, time: string) => string> = [
  (name, time) => `${name} carves a new record: ${time}!`,
  (name, time) => `${name} writes a new legend: ${time}!`,
  (name, time) => `${name} sets a new mark in blood and glass: ${time}!`,
];

const humanNewRecordMessages: ReadonlyArray<(time: string) => string> = [
  time => `You carve a new record: ${time}!`,
  time => `You write a new legend: ${time}!`,
  time => `You set a new mark in blood and glass: ${time}!`,
];

const finishMessages: ReadonlyArray<(name: string, time: string) => string> = [
  (name, time) => `${name} reaches the end in ${time}!`,
  (name, time) => `${name} survives the path in ${time}!`,
  (name, time) => `${name} emerges in ${time}!`,
];

const humanFinishMessages: ReadonlyArray<(time: string) => string> = [
  time => `You reach the end in ${time}!`,
  time => `You survive the path in ${time}!`,
  time => `You emerge in ${time}!`,
];

const helpButtonMessages: ReadonlyArray<(remaining: number) => string> = [
  r => `Seek Guidance (${r} left)`,
  r => `Ask The Expert (${r} left)`,
  r => `One Last Whisper (${r} left)`,
];

const noHelpMessages: ReadonlyArray<string> = [
  "No more aid remains.",
  "The Expert is silent now.",
  "You must face the path alone.",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GlassBridgeCompetitionType {
  prizeType?: 'LOH' | 'POS';
}

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType?: 'LOH' | 'POS';
  seed?: number;
  onComplete?: () => void;
}

type BannerVariant = 'info' | 'success' | 'danger' | 'record' | 'warning';

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlassBridgeComp({
  participantIds,
  participants,
  prizeType = 'LOH',
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const gb = useAppSelector((s: RootState) => s.glassBridge);
  const [sessionSeed] = useState<number>(() => (seed !== undefined && seed !== 0 ? seed : cryptoSeed()));

  // ── Resolve human player id ───────────────────────────────────────────────
  const humanId = useMemo(() => {
    const humanPart = participants?.find(p => p.isHuman);
    if (humanPart) return humanPart.id;
    if (participantIds.includes('user')) return 'user';
    return null;
  }, [participantIds, participants]);

  const getName = useCallback(
    (id: string): string => {
      const part = participants?.find(p => p.id === id);
      if (part) return part.name;
      if (id === 'user') return 'You';
      return id;
    },
    [participants],
  );

  // ── Local UI state ────────────────────────────────────────────────────────
  const [showSpectatorModal, setShowSpectatorModal] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [pendingStep, setPendingStep] = useState<{
    actorId: string;
    rowIdx: number;
    side: TileSide;
    isBreak: boolean;
    chosenAt: number;
  } | null>(null);
  const [shatteringTile, setShatteringTile] = useState<{
    rowIdx: number;
    side: TileSide;
  } | null>(null);
  const [showEliminationFlash, setShowEliminationFlash] = useState(false);
  const [showScreenShake, setShowScreenShake] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState<number>(gb.globalTimeLimitMs);
  /** Tile where the most recent player fell — shows the 💀 death marker. */
  const [deathMarkerTile, setDeathMarkerTile] = useState<{
    rowIdx: number;
    side: TileSide;
  } | null>(null);
  /** IDs of players currently playing the safe-landing animation. */
  const [landingPlayerIds, setLandingPlayerIds] = useState<string[]>([]);
  /** IDs of players eliminated specifically by the time-expired bridge collapse. */
  const [timedOutPlayerIds, setTimedOutPlayerIds] = useState<string[]>([]);
  /** While true, the remaining bridge tiles shatter before results are shown. */
  const [timeoutCollapseActive, setTimeoutCollapseActive] = useState(false);
  /** Current hint message from The Expert (null = no active hint). */
  const [currentHintMessage, setCurrentHintMessage] = useState<string | null>(null);
  /** Number of hints the human has requested for the current row this turn. */
  const [hintRequestsForCurrentRow, setHintRequestsForCurrentRow] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 3>(1);
  const [statusBanner, setStatusBanner] = useState<{
    message: string;
    variant: BannerVariant;
  } | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const timerIntervalRef = useRef<number | null>(null);
  const timerDisplayRef = useRef(timerDisplay);
  const aiStepTimerRef = useRef<number | null>(null);
  const parallelStepTimerRef = useRef<number | null>(null);
  const autoAdvanceRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const pendingStepRef = useRef<number | null>(null);
  const shatterResolveRef = useRef<number | null>(null);
  const flashResetRef = useRef<number | null>(null);
  const deathMarkerClearRef = useRef<number | null>(null);
  const landingTimersRef = useRef<number[]>([]);
  const timeoutCollapseResolveRef = useRef<number | null>(null);
  const statusBannerResetRef = useRef<number | null>(null);
  const playingScrollRef = useRef<HTMLDivElement | null>(null);
  const floatingUiRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const timerScaleRef = useRef<{
    anchorRealMs: number;
    elapsedMsAtAnchor: number;
    speed: 1 | 2 | 3;
  } | null>(null);
  const initParamsRef = useRef({
    participantIds,
    prizeType,
    seed: sessionSeed,
    humanId,
    participants,
  });

  // ── Order-selection AI pick queue refs (sequential pacing) ───────────────
  /** AI player IDs queued to pick, in participant order (numbers computed lazily). */
  const aiOrderPickQueueRef = useRef<string[]>([]);
  /** Index of the next AI to dispatch from aiOrderPickQueueRef. */
  const aiOrderPickIndexRef = useRef(0);
  /** Timer handle for the next scheduled AI order pick. */
  const aiOrderTimerRef = useRef<number | null>(null);
  /** Whether the human has already chosen their number this game. */
  const humanChosenForOrderRef = useRef(false);
  /** Stable function ref used by the acceleration effect. */
  const pickNextOrderFnRef = useRef<() => void>(() => {});
  /** One-shot guard: prevents duplicate finaliseOrderSelection calls. */
  const orderSelectionFinalizedRef = useRef(false);
  /** Live mirror of gb.chosenNumbers so AI timer callbacks read current state. */
  const currentChosenNumbersRef = useRef<Record<string, number>>(gb.chosenNumbers);
  /** Stable ref to the tryFinalizeOrderSelection helper (set by effect #2). */
  const tryFinalizeOrderSelectionRef = useRef<() => void>(() => {});
  /** Tracks newly-finished players to trigger landing animation. */
  const prevFinishersRef = useRef<Set<string>>(new Set());
  /** Tracks the last (phase, currentTurnIndex) combo that triggered a new-turn sound. */
  const lastNewTurnSoundRef = useRef<string>('');
  /** Tracks unfinished players before timer expiry so the timeout death sequence can animate them. */
  const unfinishedPlayerIdsRef = useRef<string[]>([]);
  /** One-shot guard for the timer-expiry collapse sequence. */
  const timeoutSequenceStartedRef = useRef(false);
  const bestFinishTimeRef = useRef<number | null>(null);

  // Stable RNG for AI step timing (different sub-seed so it doesn't affect bridge layout).
  const aiRngRef = useRef(mulberry32(sessionSeed + 9999));

  useEffect(() => {
    timerDisplayRef.current = timerDisplay;
  }, [timerDisplay]);

  function clearAllTimers() {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (aiStepTimerRef.current !== null) {
      window.clearTimeout(aiStepTimerRef.current);
      aiStepTimerRef.current = null;
    }
    if (parallelStepTimerRef.current !== null) {
      window.clearTimeout(parallelStepTimerRef.current);
      parallelStepTimerRef.current = null;
    }
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (pendingStepRef.current !== null) {
      window.clearTimeout(pendingStepRef.current);
      pendingStepRef.current = null;
    }
    if (shatterResolveRef.current !== null) {
      window.clearTimeout(shatterResolveRef.current);
      shatterResolveRef.current = null;
    }
    if (flashResetRef.current !== null) {
      window.clearTimeout(flashResetRef.current);
      flashResetRef.current = null;
    }
    if (aiOrderTimerRef.current !== null) {
      window.clearTimeout(aiOrderTimerRef.current);
      aiOrderTimerRef.current = null;
    }
    if (deathMarkerClearRef.current !== null) {
      window.clearTimeout(deathMarkerClearRef.current);
      deathMarkerClearRef.current = null;
    }
    if (timeoutCollapseResolveRef.current !== null) {
      window.clearTimeout(timeoutCollapseResolveRef.current);
      timeoutCollapseResolveRef.current = null;
    }
    if (statusBannerResetRef.current !== null) {
      window.clearTimeout(statusBannerResetRef.current);
      statusBannerResetRef.current = null;
    }
    for (const t of landingTimersRef.current) window.clearTimeout(t);
    landingTimersRef.current = [];
  }

  // ── Audio ─────────────────────────────────────────────────────────────────
  const { playSafeStep, playDeath, playWinner, playNewTurn } = useGlassBridgeAudio(
    gb.phase !== 'idle',
  );
  const effectivePlaybackSpeed = gb.humanSpectating ? playbackSpeed : 1;
  const scaleSpectatorDelay = useCallback(
    (ms: number) => Math.max(0, Math.round(ms / effectivePlaybackSpeed)),
    [effectivePlaybackSpeed],
  );
  const getEffectiveElapsedMs = useCallback(
    (realNow: number = Date.now()) => {
      if (gb.challengeStartTimeMs === null) return 0;
      const timerScale = timerScaleRef.current;
      if (!timerScale) {
        return Math.max(0, realNow - gb.challengeStartTimeMs);
      }
      return timerScale.elapsedMsAtAnchor + Math.max(0, realNow - timerScale.anchorRealMs) * timerScale.speed;
    },
    [gb.challengeStartTimeMs],
  );
  const getEffectiveNowMs = useCallback(
    (realNow: number = Date.now()) => {
      if (gb.challengeStartTimeMs === null) return realNow;
      return gb.challengeStartTimeMs + getEffectiveElapsedMs(realNow);
    },
    [gb.challengeStartTimeMs, getEffectiveElapsedMs],
  );
  const flashStatusBanner = useCallback(
    (message: string, variant: BannerVariant, durationMs = STATUS_FLASH_MS) => {
      setStatusBanner({ message, variant });
      if (statusBannerResetRef.current !== null) {
        window.clearTimeout(statusBannerResetRef.current);
      }
      statusBannerResetRef.current = window.setTimeout(() => {
        setStatusBanner(null);
        statusBannerResetRef.current = null;
      }, scaleSpectatorDelay(durationMs));
    },
    [scaleSpectatorDelay],
  );

  // ── 1. Initialize on mount ────────────────────────────────────────────────
  useEffect(() => {
    const { participantIds: pIds, prizeType: pt, seed: s, humanId: hId, participants: parts } =
      initParamsRef.current;
    dispatch(
      initGlassBridge({
        participantIds: pIds,
        participants: parts?.map(p => ({ ...p, isHuman: p.isHuman })),
        competitionType: pt ?? 'LOH',
        seed: s,
        humanPlayerId: hId,
      }),
    );
    return () => {
      clearAllTimers();
      dispatch(resetGlassBridge());
    };
  }, [dispatch]);

  // ── 1b. Keep currentChosenNumbersRef in sync (used by AI timer callbacks). ─
  useEffect(() => {
    currentChosenNumbersRef.current = gb.chosenNumbers;
  }, [gb.chosenNumbers]);

  // ── 2. Order selection: AI auto-picks (sequential, human-like pacing) ────
  useEffect(() => {
    if (gb.phase !== 'order_selection') {
      // Reset queue state when leaving the phase.
      aiOrderPickQueueRef.current = [];
      aiOrderPickIndexRef.current = 0;
      humanChosenForOrderRef.current = false;
      orderSelectionFinalizedRef.current = false;
      return;
    }

    // Seeded RNG for AI order picks (sub-seed 100 keeps it isolated from bridge layout).
    const aiRng = mulberry32(sessionSeed + 100);
    // Queue stores AI player IDs only; the actual number is picked lazily at
    // timer-fire time from the live available pool to avoid conflicts when the
    // human picks first.
    aiOrderPickQueueRef.current = gb.participants
      .filter(p => p.id !== humanId)
      .map(p => p.id);
    aiOrderPickIndexRef.current = 0;
    orderSelectionFinalizedRef.current = false;
    // If no human or human already chose (e.g. AI-only game), start in fast mode.
    humanChosenForOrderRef.current = humanId
      ? gb.chosenNumbers[humanId] !== undefined
      : true;

    // Total participant count is fixed for this game session.
    const totalParticipants = gb.participants.length;

    /**
     * Check if all players have picked and finalize exactly once.
     * Reads live state via currentChosenNumbersRef so it's always current.
     */
    function tryFinalizeOrderSelection() {
      if (orderSelectionFinalizedRef.current) return;
      const chosen = currentChosenNumbersRef.current;
      const pickedCount = Object.keys(chosen).length;
      if (pickedCount < totalParticipants) return;
      // Verify uniqueness (guard against any slice-level rejection edge case).
      const values = Object.values(chosen);
      if (new Set(values).size !== values.length) return;
      // All valid picks present — finalize exactly once.
      orderSelectionFinalizedRef.current = true;
      if (aiOrderTimerRef.current !== null) {
        window.clearTimeout(aiOrderTimerRef.current);
        aiOrderTimerRef.current = null;
      }
      revealTimerRef.current = window.setTimeout(() => {
        dispatch(finaliseOrderSelection());
      }, ORDER_REVEAL_DELAY_MS);
    }

    // Store stable reference so effect 2b can also trigger the finalize check.
    tryFinalizeOrderSelectionRef.current = tryFinalizeOrderSelection;

    // Dispatch one pick at a time with a delay so each AI player appears to
    // "think" before choosing. Remaining AI speed up once the human picks.
    function pickNext() {
      // Guard: stop the chain if the phase has already been finalized.
      if (orderSelectionFinalizedRef.current) return;

      if (aiOrderPickIndexRef.current >= aiOrderPickQueueRef.current.length) {
        // All AI have attempted picks — check if we can finalize now.
        tryFinalizeOrderSelection();
        return;
      }

      const fast = humanChosenForOrderRef.current;
      const delay = fast ? ORDER_AI_PICK_FAST_MS : ORDER_AI_PICK_SLOW_MS;

      aiOrderTimerRef.current = window.setTimeout(() => {
        // Guard: if already finalized (e.g. human picked last), skip.
        if (orderSelectionFinalizedRef.current) {
          aiOrderTimerRef.current = null;
          return;
        }

        aiOrderTimerRef.current = null;
        const playerId = aiOrderPickQueueRef.current[aiOrderPickIndexRef.current++];
        if (playerId) {
          // Re-read LIVE available numbers at fire time to avoid conflict with
          // any number the human may have already chosen.
          const chosen = currentChosenNumbersRef.current;
          const takenNums = new Set(Object.values(chosen));
          const available = Array.from({ length: totalParticipants }, (_, i) => i + 1)
            .filter(n => !takenNums.has(n));
          if (available.length > 0) {
            const idx = Math.floor(aiRng() * available.length);
            dispatch(recordNumberChoice({ playerId, number: available[idx] }));
          }
        }
        // Continue the chain; tryFinalizeOrderSelection is called when queue exhausted.
        pickNext();
      }, delay);
    }

    // Store a stable reference so effect 2b can restart the chain in fast mode.
    pickNextOrderFnRef.current = pickNext;
    pickNext();

    return () => {
      if (aiOrderTimerRef.current !== null) {
        window.clearTimeout(aiOrderTimerRef.current);
        aiOrderTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase]);

  // ── 2b. Accelerate remaining AI picks the moment the human chooses ───────
  useEffect(() => {
    if (gb.phase !== 'order_selection') return;
    if (!humanId) return;
    if (gb.chosenNumbers[humanId] === undefined) return; // human hasn't picked yet
    if (humanChosenForOrderRef.current) return; // already in fast mode

    humanChosenForOrderRef.current = true;

    // If a slow pick timer is running, cancel it and immediately start the
    // fast-mode chain so remaining AI don't keep the human waiting.
    if (aiOrderTimerRef.current !== null) {
      window.clearTimeout(aiOrderTimerRef.current);
      aiOrderTimerRef.current = null;
      pickNextOrderFnRef.current();
    } else {
      // No timer is running (e.g. all AIs already picked before the human).
      // Just run the finalize check — effect #3 will also catch this, but
      // calling it here ensures we never miss the completion moment.
      tryFinalizeOrderSelectionRef.current();
    }
  }, [gb.chosenNumbers, gb.phase, humanId]);

  // ── 3. When all numbers chosen (including human), finalise ───────────────
  useEffect(() => {
    if (gb.phase !== 'order_selection') return;
    if (!humanId) return; // AI-only handled by pickNext
    // Guard: don't schedule if already finalizing.
    if (orderSelectionFinalizedRef.current) return;
    const totalChosen = Object.keys(gb.chosenNumbers).length;
    const total = gb.participants.length;
    if (totalChosen < total) return;
    // All players have picked — finalize via the one-shot guard.
    tryFinalizeOrderSelectionRef.current();
  }, [gb.phase, gb.chosenNumbers, gb.participants.length, humanId]);

  // ── 4. Order reveal animation ─────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'order_reveal') {
      setRevealedCount(0);
      return;
    }

    let count = 0;
    const total = gb.turnOrder.length;

    function revealNext() {
      count++;
      setRevealedCount(count);
      if (count < total) {
        revealTimerRef.current = window.setTimeout(revealNext, REVEAL_STAGGER_MS);
      } else {
        // All revealed — advance to playing.
        revealTimerRef.current = window.setTimeout(() => {
          dispatch(startPlaying({ now: Date.now() }));
        }, REVEAL_TO_PLAY_DELAY_MS);
      }
    }

    revealTimerRef.current = window.setTimeout(revealNext, REVEAL_STAGGER_MS);

    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.phase]);

  // ── 5. Global timer display ───────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing' || gb.challengeStartTimeMs === null) {
      timerScaleRef.current = null;
      if (gb.phase !== 'playing') {
        setTimerDisplay(gb.globalTimeLimitMs);
      }
      return;
    }

    const realNow = Date.now();
    const previousTimerScale = timerScaleRef.current;
    const elapsedMs = previousTimerScale
      ? previousTimerScale.elapsedMsAtAnchor
        + Math.max(0, realNow - previousTimerScale.anchorRealMs) * previousTimerScale.speed
      : Math.max(0, realNow - gb.challengeStartTimeMs);
    timerScaleRef.current = {
      anchorRealMs: realNow,
      elapsedMsAtAnchor: elapsedMs,
      speed: effectivePlaybackSpeed,
    };
    setTimerDisplay(Math.max(0, gb.globalTimeLimitMs - elapsedMs));
  }, [effectivePlaybackSpeed, gb.phase, gb.challengeStartTimeMs, gb.globalTimeLimitMs]);

  useEffect(() => {
    if (gb.phase !== 'playing' || gb.challengeStartTimeMs === null) return;
    if (gb.globalTimeLimitMs <= 0) return;
    const challengeStartTimeMs = gb.challengeStartTimeMs;

    function tick() {
      const elapsed = getEffectiveElapsedMs();
      const remaining = Math.max(0, gb.globalTimeLimitMs - elapsed);
      setTimerDisplay(remaining);

      const pendingSelectedBeforeExpiry =
        !!pendingStep &&
        pendingStep.chosenAt < challengeStartTimeMs + gb.globalTimeLimitMs;

      // Preserve the logical selection moment for a tile that was chosen before time expired,
      // even if its suspense animation is still playing.
      if (remaining <= 0 && !gb.timerExpired && !pendingSelectedBeforeExpiry) {
        dispatch(expireTimer());
      }
    }

    // Prime the HUD immediately so players see the correct remaining time from
    // the first frame instead of a brief visual delay before the 250 ms interval.
    tick();
    timerIntervalRef.current = window.setInterval(tick, 250);
    return () => {
      if (timerIntervalRef.current !== null) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [gb.phase, gb.challengeStartTimeMs, gb.timerExpired, pendingStep, dispatch, gb.globalTimeLimitMs, getEffectiveElapsedMs]);

  // ── 5b. Track unfinished players before timer expiry for the collapse sequence ─
  useEffect(() => {
    if (gb.phase !== 'playing') {
      unfinishedPlayerIdsRef.current = [];
      return;
    }
    if (gb.timerExpired) return;
    unfinishedPlayerIdsRef.current = gb.turnOrder.filter(pid => {
      const progress = gb.progress[pid];
      return !!progress && !progress.eliminated && progress.finishTimeMs === undefined;
    });
  }, [gb.phase, gb.progress, gb.timerExpired, gb.turnOrder]);

  // ── 6. AI step automation ──────────────────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing' || gb.timerExpired) return;
    if (!shouldStartParallelPlayers(timerDisplay) || gb.parallelPlayerIds.length > 0) return;
    const activeId = selectActivePlayerId(gb);
    const hasUnstartedPlayers = gb.turnOrder.some((playerId) =>
      playerId !== activeId && gb.progress[playerId]?.firstStepAtMs === undefined,
    );
    if (hasUnstartedPlayers) {
      dispatch(startParallelPlayers());
      flashStatusBanner('Less than a minute remains — waiting players are entering the path now!', 'warning');
    }
  }, [dispatch, flashStatusBanner, gb, timerDisplay]);

  // Independently advance released AI players while the original active turn continues.
  useEffect(() => {
    if (gb.phase !== 'playing' || gb.timerExpired || gb.parallelPlayerIds.length === 0) return;
    const candidates = gb.parallelPlayerIds
      .filter((playerId) => playerId !== humanId)
      .map((playerId) => ({ playerId, progress: gb.progress[playerId] }))
      .filter(({ progress }) => progress && !progress.eliminated && progress.finishTimeMs === undefined)
      .sort((a, b) => a.progress.furthestRowReached - b.progress.furthestRowReached);
    const candidate = candidates[0];
    if (!candidate) return;
    const rowNumber = candidate.progress.furthestRowReached + 1;
    const row = gb.rows[rowNumber - 1];
    if (!row) return;
    const occupiedSides = Object.entries(gb.progress)
      .filter(([playerId, progress]) =>
        playerId !== candidate.playerId
        && !progress.eliminated
        && progress.finishTimeMs === undefined
        && progress.furthestRowReached === rowNumber
        && progress.currentSide,
      )
      .map(([, progress]) => progress.currentSide!);
    const participant = gb.participants.find((entry) => entry.id === candidate.playerId);
    const chosenSide = chooseParallelAiSide(
      row,
      occupiedSides,
      timerDisplayRef.current,
      aiRngRef.current,
      participant?.competitionProfile,
    );
    parallelStepTimerRef.current = window.setTimeout(() => {
      dispatch(resolveParallelStep({
        playerId: candidate.playerId,
        chosenSide,
        now: getEffectiveNowMs(),
      }));
      parallelStepTimerRef.current = null;
    }, scaleSpectatorDelay(1_500));
    return () => {
      if (parallelStepTimerRef.current !== null) {
        window.clearTimeout(parallelStepTimerRef.current);
        parallelStepTimerRef.current = null;
      }
    };
  }, [dispatch, gb, getEffectiveNowMs, humanId, scaleSpectatorDelay]);

  useEffect(() => {
    if (gb.phase !== 'playing') return;

    const activeId = selectActivePlayerId(gb);
    if (!activeId) return;
    if (gb.parallelPlayerIds.includes(activeId)) return;

    const isHumanTurn = activeId === humanId && !gb.humanSpectating;
    if (isHumanTurn) return; // human controls their own steps

    if (gb.timerExpired) return;
    if (pendingStep) return;

    // Check if already done.
    const progress = gb.progress[activeId];
    if (!progress || progress.eliminated || progress.finishTimeMs !== undefined) return;

    const rowIdx = gb.currentPlayerRow - 1;
    if (rowIdx < 0 || rowIdx >= gb.rows.length) return;
    const row = gb.rows[rowIdx];
    const hintsUsed = getHintUses(progress.hintPenaltyMs);
    const willUseHint =
      !row.leftBroken &&
      !row.rightBroken &&
      !row.revealedSafeSide &&
      shouldAiUseHint(rowIdx, gb.rowsCount, hintsUsed, aiRngRef.current);
    const delay = scaleSpectatorDelay(getAiDecisionDelayMs(row, aiRngRef.current));

    if (aiStepTimerRef.current !== null) {
      window.clearTimeout(aiStepTimerRef.current);
    }

    aiStepTimerRef.current = window.setTimeout(() => {
      // Double-check the game is still in playing state.
      if (gb.phase !== 'playing' || gb.timerExpired) return;

      // Find the active participant's profile.
      const participant = gb.participants.find(p => p.id === activeId);

      const chosenSide = willUseHint
        ? chooseSideFromHint(row.safeSide, 1, aiRngRef.current)
        : aiDecideStep(row, aiRngRef.current, participant?.competitionProfile);
      const now = getEffectiveNowMs();

      // Check if it's a wrong choice (for animation).
      const isBreak = chosenSide !== row.safeSide;

      const noAnimations = areAnimationsDisabled();
      const suspenseDelay = scaleSpectatorDelay(noAnimations ? 0 : STEP_SUSPENSE_DELAY_MS);
      const shatterDelay = scaleSpectatorDelay(noAnimations ? 0 : SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS);

      if (willUseHint) {
        flashStatusBanner(pickRandom(expertHintUsedMessages)(getName(activeId)), 'info', STATUS_FLASH_SHORT_MS);
      }
      setPendingStep({ actorId: activeId, rowIdx, side: chosenSide, isBreak, chosenAt: now });
      pendingStepRef.current = window.setTimeout(() => {
        if (willUseHint) {
          dispatch(recordHintUsed({ playerId: activeId }));
        }
        if (isBreak) {
          setShatteringTile({ rowIdx, side: chosenSide });
          setShowEliminationFlash(true);
          setShowScreenShake(true);
          setDeathMarkerTile({ rowIdx, side: chosenSide });
          playDeath();
          flashStatusBanner(pickRandom(aiCrashMessages)(getName(activeId), rowIdx + 1), 'danger');
          if (flashResetRef.current !== null) {
            window.clearTimeout(flashResetRef.current);
          }
          flashResetRef.current = window.setTimeout(() => {
            setShowEliminationFlash(false);
            setShowScreenShake(false);
          }, noAnimations ? 0 : DEATH_FLASH_MS);
          if (deathMarkerClearRef.current !== null) {
            window.clearTimeout(deathMarkerClearRef.current);
          }
          deathMarkerClearRef.current = window.setTimeout(() => {
            setDeathMarkerTile(null);
          }, noAnimations ? 0 : DEATH_MARKER_DURATION_MS);
          shatterResolveRef.current = window.setTimeout(() => {
            setShatteringTile(null);
            setPendingStep(null);
            dispatch(resolveStep({ chosenSide, now }));
            // Game-over detection is handled by effect #7 which watches gb state.
          }, shatterDelay);
          return;
        }

        setPendingStep(null);
        playSafeStep();
        if (rowIdx + 1 < gb.rowsCount) {
          flashStatusBanner(pickRandom(aiClearMessages)(getName(activeId), rowIdx + 1), 'success');
        }
        dispatch(resolveStep({ chosenSide, now }));
        // Game-over detection is handled by effect #7 which watches gb state.
      }, suspenseDelay);
    }, delay);

    return () => {
      if (aiStepTimerRef.current !== null) {
        window.clearTimeout(aiStepTimerRef.current);
        aiStepTimerRef.current = null;
      }
    };
  }, [gb.phase, gb.currentTurnIndex, gb.currentPlayerRow, gb.timerExpired, humanId, pendingStep, gb, dispatch, playSafeStep, playDeath, scaleSpectatorDelay, flashStatusBanner, getName, getEffectiveNowMs]);

  // ── 7. Timer expiry sequence — collapse the bridge before showing results ─
  useEffect(() => {
    if (gb.phase !== 'playing') {
      timeoutSequenceStartedRef.current = false;
      setTimeoutCollapseActive(false);
      setTimedOutPlayerIds([]);
      bestFinishTimeRef.current = null;
      return;
    }
    if (!gb.timerExpired || timeoutSequenceStartedRef.current) return;

    timeoutSequenceStartedRef.current = true;

    const doomedIds = unfinishedPlayerIdsRef.current;
    if (doomedIds.length === 0) {
      dispatch(completeGame());
      return;
    }

    const noAnimations = areAnimationsDisabled();
    const collapseDuration = scaleSpectatorDelay(getTimeoutCollapseDuration(gb.rows.length, noAnimations));
    const activeId = gb.turnOrder[gb.currentTurnIndex] ?? null;
    const activeRow =
      activeId && gb.currentPlayerRow > 0 && gb.currentPlayerRow <= gb.rows.length
        ? gb.rows[gb.currentPlayerRow - 1]
        : null;

    setShowSpectatorModal(false);
    setTimedOutPlayerIds(doomedIds);
    setTimeoutCollapseActive(true);
    setShowEliminationFlash(true);
    setShowScreenShake(true);
    playDeath();
    if (
      activeId
      && activeRow
      && gb.progress[activeId]?.firstStepAtMs !== undefined
      && hasOneBrokenTile(activeRow)
    ) {
      flashStatusBanner(
        getBrokenPlatformFallMessage(activeId === humanId, getName(activeId)),
        'danger',
      );
    }

    if (flashResetRef.current !== null) {
      window.clearTimeout(flashResetRef.current);
    }
    flashResetRef.current = window.setTimeout(() => {
      setShowEliminationFlash(false);
      setShowScreenShake(false);
    }, noAnimations ? 0 : DEATH_FLASH_MS);

    timeoutCollapseResolveRef.current = window.setTimeout(() => {
      dispatch(completeGame());
    }, collapseDuration);
  }, [
    gb.currentPlayerRow,
    gb.currentTurnIndex,
    gb.phase,
    gb.progress,
    gb.rows,
    gb.timerExpired,
    gb.turnOrder,
    dispatch,
    playDeath,
    scaleSpectatorDelay,
    flashStatusBanner,
    getName,
    humanId,
  ]);

  // ── 8. Detect end-of-game conditions ──────────────────────────────────────
  useEffect(() => {
    if (gb.phase !== 'playing') return;
    if (timeoutSequenceStartedRef.current) return;
    if (selectIsGameOver(gb)) {
      dispatch(completeGame());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.currentTurnIndex, gb.timerExpired, gb.progress]);

  // ── 9. Resolve outcome when complete ─────────────────────────────────────
  useEffect(() => {
    if (gb.phase === 'complete' && !gb.outcomeResolved) {
      dispatch(resolveGlassBridgeOutcome());
    }
  }, [gb.phase, gb.outcomeResolved, dispatch]);

  // ── 10. Complete — outcome is applied by effect #9; user advances via the
  //        Continue button. No auto-advance timer so the results screen persists
  //        until the player taps Continue (matches spec requirement 5.1).

  // ── 11. Human eliminated → show spectator modal ───────────────────────────
  useEffect(() => {
    if (!humanId) return;
    const progress = gb.progress[humanId];
    if (progress?.eliminated && !gb.humanSpectating && gb.phase === 'playing') {
      setShowSpectatorModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gb.progress, humanId, gb.phase]);

  // ── 12. Safe-landing animation — detect newly-finished players ────────────
  useEffect(() => {
    if (gb.phase !== 'playing') return;
    let isFirstFinisher = prevFinishersRef.current.size === 0;
    for (const [pid, p] of Object.entries(gb.progress)) {
      if (p.finishTimeMs !== undefined && !prevFinishersRef.current.has(pid)) {
        prevFinishersRef.current.add(pid);
        if (isFirstFinisher) {
          playWinner();
          isFirstFinisher = false;
        }
        const effectiveFinishTime = p.finishTimeMs + (p.hintPenaltyMs ?? 0);
        const isRecord =
          bestFinishTimeRef.current === null || effectiveFinishTime < bestFinishTimeRef.current;
        if (isRecord) {
          bestFinishTimeRef.current = effectiveFinishTime;
        }
        flashStatusBanner(
          getCompletionBannerMessage(
            pid === humanId,
            isRecord,
            getName(pid),
            formatElapsed(effectiveFinishTime),
          ),
          isRecord ? 'record' : 'success',
        );
        setLandingPlayerIds(prev => [...prev, pid]);
        const t = window.setTimeout(() => {
          setLandingPlayerIds(prev => prev.filter(id => id !== pid));
          landingTimersRef.current = landingTimersRef.current.filter(x => x !== t);
        }, LANDING_ANIM_DURATION_MS);
        landingTimersRef.current.push(t);
      }
    }
  }, [gb.progress, gb.phase, humanId, playWinner, flashStatusBanner, getName]);

  // ── 13. New-turn sound — play whenever a new player starts their turn ──────
  useEffect(() => {
    if (gb.phase !== 'playing') {
      // Reset the guard so a fresh game session starts clean.
      lastNewTurnSoundRef.current = '';
      return;
    }
    const key = `playing:${gb.currentTurnIndex}`;
    if (lastNewTurnSoundRef.current === key) return;
    // Only play if there is an active player who hasn't finished or been eliminated.
    const activePlayerId = gb.turnOrder[gb.currentTurnIndex];
    if (!activePlayerId) return;
    const progress = gb.progress[activePlayerId];
    if (progress?.eliminated || progress?.finishTimeMs !== undefined) return;
    lastNewTurnSoundRef.current = key;
    playNewTurn();
  }, [gb.phase, gb.currentTurnIndex, gb.turnOrder, gb.progress, playNewTurn]);

  // ── 14. Clear hint state when the human moves to a new row, the active turn
  //        index changes, or the game phase changes. This keeps per-row hint
  //        escalation scoped to the current decision only.
  useEffect(() => {
    setCurrentHintMessage(null);
    setHintRequestsForCurrentRow(0);
  }, [gb.phase, gb.currentPlayerRow, gb.currentTurnIndex]);

  useEffect(() => {
    if (gb.phase !== 'playing') return;
    if (!isMobileViewport()) return;

    const scrollContainer = playingScrollRef.current;
    const currentRowEl = rowRefs.current[gb.currentPlayerRow - 1];
    if (!scrollContainer || !currentRowEl) return;

    const scrollRect = scrollContainer.getBoundingClientRect();
    const rowRect = currentRowEl.getBoundingClientRect();
    const floatingOffset = floatingUiRef.current?.getBoundingClientRect().height ?? 0;
    const visibleTop = scrollRect.top + floatingOffset + 12;
    const visibleBottom = scrollRect.bottom - 12;
    const availableHeight = Math.max(1, visibleBottom - visibleTop);
    const rowHeight = rowRect.bottom - rowRect.top;

    if (rowRect.top >= visibleTop && rowRect.bottom <= visibleBottom) return;

    const delta = rowHeight > availableHeight || rowRect.top < visibleTop
      ? rowRect.top - visibleTop
      : rowRect.bottom - visibleBottom;
    const nextTop = Math.max(0, scrollContainer.scrollTop + delta);
    const scrollBehavior = areAnimationsDisabled() || prefersReducedMotion() ? 'auto' : 'smooth';

    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: nextTop, behavior: scrollBehavior });
    } else {
      scrollContainer.scrollTop = nextTop;
    }
  }, [gb.phase, gb.currentPlayerRow, gb.currentTurnIndex, humanId, gb.humanSpectating, currentHintMessage]);

  // ── Human actions ─────────────────────────────────────────────────────────

  const handleHumanNumberPick = useCallback(
    (number: number) => {
      if (!humanId) return;
      dispatch(recordNumberChoice({ playerId: humanId, number }));
    },
    [humanId, dispatch],
  );

  const handleHumanStep = useCallback(
    (side: TileSide) => {
      if (!humanId) return;
      if (gb.phase !== 'playing') return;
      if (gb.timerExpired) return;
      if (pendingStep) return;

      const activeId = selectActivePlayerId(gb);
      const isParallelHuman = gb.parallelPlayerIds.includes(humanId);
      if (activeId !== humanId && !isParallelHuman) return;

      const rowIdx = isParallelHuman
        ? (gb.progress[humanId]?.furthestRowReached ?? 0)
        : gb.currentPlayerRow - 1;
      if (rowIdx < 0 || rowIdx >= gb.rows.length) return;
      const row = gb.rows[rowIdx];

      const isBreak = side !== row.safeSide;
      const chosenAt = getEffectiveNowMs();
      const noAnimations = areAnimationsDisabled();
      const suspenseDelay = noAnimations ? 0 : STEP_SUSPENSE_DELAY_MS;
      const shatterDelay = noAnimations ? 0 : SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS;

      setPendingStep({ actorId: humanId, rowIdx, side, isBreak, chosenAt });
      pendingStepRef.current = window.setTimeout(() => {
        if (isBreak) {
          setShatteringTile({ rowIdx, side });
          setShowEliminationFlash(true);
          setShowScreenShake(true);
          setDeathMarkerTile({ rowIdx, side });
          playDeath();
          flashStatusBanner(pickRandom(humanCrashMessages)(rowIdx + 1), 'danger');

          // Clear any existing flash/death-marker timeouts before scheduling new ones
          if (flashResetRef.current != null) {
            window.clearTimeout(flashResetRef.current);
          }
          if (deathMarkerClearRef.current != null) {
            window.clearTimeout(deathMarkerClearRef.current);
          }

          flashResetRef.current = window.setTimeout(() => {
            setShowEliminationFlash(false);
            setShowScreenShake(false);
          }, noAnimations ? 0 : DEATH_FLASH_MS);
          deathMarkerClearRef.current = window.setTimeout(() => {
            setDeathMarkerTile(null);
          }, noAnimations ? 0 : DEATH_MARKER_DURATION_MS);
          shatterResolveRef.current = window.setTimeout(() => {
            setShatteringTile(null);
            setPendingStep(null);
            dispatch(isParallelHuman
              ? resolveParallelStep({ playerId: humanId, chosenSide: side, now: chosenAt })
              : resolveStep({ chosenSide: side, now: chosenAt }));
          }, shatterDelay);
          return;
        }

        setPendingStep(null);
        playSafeStep();
        if (rowIdx + 1 < gb.rowsCount) {
          flashStatusBanner(pickRandom(humanClearMessages)(rowIdx + 1), 'success');
        }
        dispatch(isParallelHuman
          ? resolveParallelStep({ playerId: humanId, chosenSide: side, now: chosenAt })
          : resolveStep({ chosenSide: side, now: chosenAt }));
      }, suspenseDelay);
    },
    [humanId, gb, dispatch, pendingStep, playSafeStep, playDeath, flashStatusBanner, getEffectiveNowMs],
  );

  const handleContinueWatching = useCallback(() => {
    setShowSpectatorModal(false);
    setPlaybackSpeed(1);
    dispatch(setHumanSpectating(true));
  }, [dispatch]);

  const handleSkipToResult = useCallback(() => {
    setShowSpectatorModal(false);
    // Ensure the game state is complete and outcome resolved before navigating away.
    dispatch(completeGame());
    dispatch(resolveGlassBridgeOutcome());
    onComplete?.();
  }, [dispatch, onComplete]);

  const handleRequestHelp = useCallback(() => {
    if (!humanId) return;
    const humanProgress = gb.progress[humanId];
    if (!humanProgress) return;
    const hintsUsed = getHintUses(humanProgress.hintPenaltyMs);
    if (hintsUsed >= MAX_HINTS_PER_RUN) return;

    const rowIdx = gb.parallelPlayerIds.includes(humanId)
      ? humanProgress.furthestRowReached
      : gb.currentPlayerRow - 1;
    if (rowIdx < 0 || rowIdx >= gb.rows.length) return;
    const row = gb.rows[rowIdx];

    // ── Ad-gating placeholder ──────────────────────────────────────────────
    // TODO: Replace this comment block with real ad-request logic before granting
    // the hint below.  The hint is intentionally granted unconditionally here so
    // the mechanic can be tested without a live ad provider.
    // When real ads are integrated:
    //   1. Call your ad-provider's showRewardedAd() here.
    //   2. Only execute the code below inside the "ad completed" callback.
    // ──────────────────────────────────────────────────────────────────────

    const sameRowHintCount = hintRequestsForCurrentRow + 1;
    const chance = computeHintLeftBreakChance(row.safeSide, sameRowHintCount);
    setCurrentHintMessage(pickRandom(hintMessages)(chance));
    setHintRequestsForCurrentRow(sameRowHintCount);
    dispatch(recordHintUsed({ playerId: humanId }));
  }, [humanId, gb.progress, gb.currentPlayerRow, gb.parallelPlayerIds, gb.rows, dispatch, hintRequestsForCurrentRow]);

  // ── Derived values ────────────────────────────────────────────────────────

  const activeId = selectActivePlayerId(gb);
  const humanIsParallel = humanId ? gb.parallelPlayerIds.includes(humanId) : false;
  const isHumanTurn = (activeId === humanId || humanIsParallel) && !gb.humanSpectating;
  const humanProgress = humanId ? gb.progress[humanId] : null;
  const currentRowForDisplay = humanIsParallel && humanProgress
    ? humanProgress.furthestRowReached + 1
    : gb.currentPlayerRow;
  const isHumanEliminated = !!humanProgress?.eliminated;
  const pendingActorId = pendingStep?.actorId ?? null;
  const hintsUsed = getHintUses(humanProgress?.hintPenaltyMs);
  const hintsRemaining = MAX_HINTS_PER_RUN - hintsUsed;
  const canRequestHelp =
    gb.phase === 'playing' &&
    isHumanTurn &&
    !isHumanEliminated &&
    !pendingStep &&
    !gb.timerExpired &&
    hintsRemaining > 0;

  const timerClass =
    timerDisplay <= 10_000
      ? 'gb-timer-critical'
      : timerDisplay <= 30_000
        ? 'gb-timer-warning'
        : '';
  const isTimeoutPlayer = (playerId: string) => timedOutPlayerIds.includes(playerId);
  const defaultBannerText = useMemo(() => {
    if (timeoutCollapseActive) return pickRandom(timesUpMessages);
    if (isHumanTurn && !pendingStep) return pickRandom(stepPromptMessages);
    if (activeId) return pickRandom(activePlayerMessages)(getName(activeId));
    return pickRandom(waitingMessages);
  }, [timeoutCollapseActive, isHumanTurn, pendingStep, activeId, getName]);
  const bannerText = statusBanner?.message ?? defaultBannerText;
  const nextPlaybackSpeed = getNextPlaybackSpeed(playbackSpeed);
  const canFastForward = gb.humanSpectating && isHumanEliminated && gb.phase === 'playing';
  const { helpAriaLabel, helpButtonText } = useMemo(() => {
    if (hintsRemaining > 0) {
      const buttonText = pickRandom(helpButtonMessages)(hintsRemaining);
      return {
        helpAriaLabel: `${buttonText}. Adds ${HINT_PENALTY_MS / 1000} seconds.`,
        helpButtonText: `🔮 ${buttonText}`,
      };
    }

    const noHelpText = pickRandom(noHelpMessages);
    return {
      helpAriaLabel: noHelpText,
      helpButtonText: noHelpText,
    };
  }, [hintsRemaining]);
  const handleTogglePlaybackSpeed = () => {
    setPlaybackSpeed(nextPlaybackSpeed);
    flashStatusBanner(
      nextPlaybackSpeed === 1
        ? 'Back to normal speed.'
        : `Watching at ${nextPlaybackSpeed}× speed.`,
      'info',
      STATUS_FLASH_SHORT_MS,
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={`glass-bridge${gb.phase === 'playing' ? ' gb-phase-playing' : ''}${showScreenShake ? ' gb-screen-shake' : ''}`}
      role="main"
      aria-label="The Crystal Path"
    >
      {/* HUD */}
      {(gb.phase === 'playing' || gb.phase === 'complete') && (
        <div className="gb-hud" role="banner">
          <span className="gb-hud-title">The Crystal Path</span>
          {gb.phase === 'playing' && gb.challengeStartTimeMs !== null && gb.globalTimeLimitMs > 0 && (
            <span className={`gb-hud-timer ${timerClass}`} aria-label="Time remaining">
              ⏱ {formatTimeRemaining(timerDisplay)}
            </span>
          )}
          {gb.phase === 'playing' && (
            <span className="gb-hud-turn" aria-label="Current turn">
              {activeId
                ? activeId === humanId
                  ? 'Your turn'
                  : `${getName(activeId)}'s turn`
                : 'Waiting…'}
            </span>
          )}
        </div>
      )}

      {/* ── Order Selection ── */}
      {gb.phase === 'order_selection' && (
        <div className="gb-order-selection">
          <h2>Choose Your Number</h2>
          <p>
            Pick a number from 1 to {gb.participants.length}.<br />
            The reveal order will determine who crosses first.
          </p>
          <div className="gb-number-grid" role="group" aria-label="Number selection">
            {Array.from({ length: gb.participants.length }, (_, i) => i + 1).map(num => {
              const takenByOther = Object.entries(gb.chosenNumbers).some(
                ([pid, n]) => n === num && pid !== humanId,
              );
              const takenByMe = humanId ? gb.chosenNumbers[humanId] === num : false;
              const isTaken = takenByOther;
              const isDisabled = isTaken || !!humanProgress?.eliminated || !humanId;
              const alreadyChose = humanId ? gb.chosenNumbers[humanId] !== undefined : true;

              return (
                <button
                  key={num}
                  className={`gb-number-btn${isTaken ? ' gb-number-taken' : ''}${takenByMe ? ' gb-number-mine' : ''}`}
                  disabled={isDisabled || alreadyChose}
                  onClick={() => handleHumanNumberPick(num)}
                  aria-label={`Pick number ${num}${isTaken ? ' (taken)' : ''}${takenByMe ? ' (your pick)' : ''}`}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {/* Status of who has chosen */}
          <div className="gb-order-waiting-list" aria-label="Selection status">
            {gb.participants.map(p => {
              const chosen = gb.chosenNumbers[p.id];
              const isYou = p.id === humanId;
              return (
                <div
                  key={p.id}
                  className={`gb-order-waiting-item${chosen !== undefined ? ' gb-waiting-done' : ''}`}
                >
                  <span>{isYou ? 'You' : getName(p.id)}</span>
                  <span>{chosen !== undefined ? `#${chosen} ✓` : 'Choosing…'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order Reveal ── */}
      {gb.phase === 'order_reveal' && (
        <div className="gb-order-reveal">
          <h2>Turn Order Revealed</h2>
          <div className="gb-reveal-list" role="list" aria-label="Turn order">
            {gb.turnOrder.slice(0, revealedCount).map((playerId, idx) => {
              const isYou = playerId === humanId;
              return (
                <div
                  key={playerId}
                  className={`gb-reveal-item${isYou ? ' gb-reveal-you gb-reveal-spotlight' : ''}`}
                  role="listitem"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <span className="gb-reveal-pos">{idx + 1}.</span>
                  <span className="gb-reveal-name">
                    {isYou ? '⭐ You' : getName(playerId)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Playing ── */}
      {gb.phase === 'playing' && (
        <div className="gb-playing" ref={playingScrollRef}>
          <div className="gb-floating-ui" ref={floatingUiRef}>
            <div className="gb-active-banner-row">
              <div
                className={`gb-active-banner${statusBanner ? ` gb-active-banner-flash gb-active-banner-${statusBanner.variant}` : ''}`}
                aria-live="polite"
              >
                {bannerText}
              </div>
              {canFastForward && (
                <button
                  type="button"
                  className="gb-ffwd-btn"
                  onClick={handleTogglePlaybackSpeed}
                  aria-label={`Playback speed ${playbackSpeed}x. Tap to switch to ${nextPlaybackSpeed}x`}
                >
                  ⏩ {playbackSpeed}×
                </button>
              )}
            </div>
            {isHumanTurn && !isHumanEliminated && !gb.timerExpired && (
              <div className="gb-hint-area">
                {currentHintMessage && (
                  <div className="gb-hint-message" role="status" aria-live="polite">
                    🔮 {currentHintMessage}
                  </div>
                )}
                <button
                  className="gb-btn-help"
                  onClick={handleRequestHelp}
                  disabled={!canRequestHelp}
                  aria-label={helpAriaLabel}
                >
                  {helpButtonText}
                </button>
              </div>
            )}
          </div>
          {/* Bridge */}
          <div className="gb-bridge-container" role="region" aria-label="Crystal path">
            {/* LED accent rails — decorative outer edge lighting */}
            <div className="gb-led-rail gb-led-rail-left gb-side-led" aria-hidden="true" />
            <div className="gb-led-rail gb-led-rail-right gb-side-led" aria-hidden="true" />
            {gb.rows.map((row, rowIdx) => {
              const rowNum = rowIdx + 1;
              const isCurrentRow = currentRowForDisplay === rowNum;
              const rowDepthScale = Math.max(0.82, 1 - rowIdx * 0.015);

              // Find players on this row (those who have reached exactly this row and are active).
              const playersOnRow = gb.turnOrder.filter(pid => {
                const p = gb.progress[pid];
                const timedOutOnBridge =
                  timeoutCollapseActive &&
                  isTimeoutPlayer(pid) &&
                  (activeId === pid || gb.parallelPlayerIds.includes(pid)) &&
                  isCurrentRow;
                return (
                  p &&
                  p.finishTimeMs === undefined &&
                  activeId === pid &&
                  isCurrentRow &&
                  (!p.eliminated || timedOutOnBridge)
                );
              });

              return (
                <div
                  key={rowIdx}
                  className={`gb-row${isCurrentRow ? ' gb-row-current' : ' gb-row-dimmed'}`}
                  ref={(node) => {
                    rowRefs.current[rowIdx] = node;
                  }}
                  style={{ transform: `scale(${rowDepthScale})`, opacity: isCurrentRow ? 1 : Math.max(0.46, 1 - rowIdx * 0.03) }}
                >
                  <span className="gb-row-label">{rowNum}</span>
                  <div className="gb-tiles">
                    {(['left', 'right'] as TileSide[]).map(side => {
                      const isBroken = side === 'left' ? row.leftBroken : row.rightBroken;
                      const isShatterAnim =
                        shatteringTile?.rowIdx === rowIdx && shatteringTile?.side === side;
                      const isPendingTile =
                        pendingStep?.rowIdx === rowIdx && pendingStep?.side === side;
                      const canActivate =
                        isHumanTurn &&
                        isCurrentRow &&
                        !isBroken &&
                        !pendingStep &&
                        !timeoutCollapseActive;
                      const timeoutDelayMs =
                        rowIdx * TIMEOUT_ROW_BREAK_STAGGER_MS
                        + (side === 'right' ? TIMEOUT_SIDE_BREAK_OFFSET_MS : 0);

                      let tileClass = 'gb-tile';
                      if (isBroken || isShatterAnim) tileClass += ' gb-tile-broken';
                      if (isShatterAnim) tileClass += ' gb-tile-shatter';
                      if (timeoutCollapseActive && !isBroken && !isShatterAnim) {
                        tileClass += ' gb-tile-timeout-break';
                      }
                      if (canActivate && !isBroken) tileClass += ' gb-tile-active';
                      if (isCurrentRow) tileClass += ' gb-tile-current-row';
                      if (!isCurrentRow) tileClass += ' gb-tile-inactive';
                      if (isPendingTile) tileClass += ' gb-tile-selected';

                      return (
                        <div
                          key={side}
                          className={tileClass}
                          style={
                            timeoutCollapseActive && !isBroken && !isShatterAnim
                              ? { animationDelay: `${timeoutDelayMs}ms` }
                              : undefined
                          }
                          onClick={canActivate ? () => handleHumanStep(side) : undefined}
                          role={canActivate ? 'button' : undefined}
                          tabIndex={canActivate ? 0 : undefined}
                           onKeyDown={
                             canActivate
                               ? e => {
                                   if (e.key === 'Enter' || e.key === ' ') {
                                     if (e.key === ' ') {
                                       e.preventDefault();
                                     }
                                     handleHumanStep(side);
                                   }
                                 }
                               : undefined
                           }
                          aria-label={`${side} tile${isBroken ? ' (broken)' : ''}${canActivate ? ' — step here' : ''}`}
                          aria-disabled={isBroken || !canActivate}
                        >
                          <span className="gb-tile-label">{side}</span>
                          {/* Death marker — shown briefly at the tile where a player fell */}
                          {deathMarkerTile?.rowIdx === rowIdx && deathMarkerTile?.side === side && (
                            <div className="gb-death-marker" aria-hidden="true">💀</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Players currently on this row */}
                  <div className="gb-row-players">
                    {playersOnRow.map(pid => (
                      <div
                        key={pid}
                        className={`gb-player-marker${pid === activeId ? ' gb-player-active' : ''}${pid === humanId ? ' gb-player-you' : ''}${pendingActorId === pid && shatteringTile ? ' gb-player-falling' : ''}${timeoutCollapseActive && isTimeoutPlayer(pid) ? ' gb-player-falling' : ''}`}
                        title={getName(pid)}
                      >
                        <GlassBridgeAvatar
                          id={pid}
                          name={getName(pid)}
                          alt={getName(pid)}
                          size={18}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Safe platform — finishers land here with a bounce animation */}
            {landingPlayerIds.length > 0 && (
              <div className="gb-safe-platform">
                {landingPlayerIds.map(pid => (
                  <div key={pid} className="gb-player-marker gb-player-landing" title={getName(pid)}>
                    <GlassBridgeAvatar
                      id={pid}
                      name={getName(pid)}
                      alt={getName(pid)}
                      size={18}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Compact active-player avatar bar — remaining active players in turn order */}
          <div className="gb-avatar-bar" role="list" aria-label="Active players">
            {gb.turnOrder
              .filter(pid => {
                const p = gb.progress[pid];
                return (
                  !!p &&
                  p.finishTimeMs === undefined &&
                  (!p.eliminated || (timeoutCollapseActive && isTimeoutPlayer(pid)))
                );
              })
              .map((pid, idx) => {
                const isActive = activeId === pid;
                const isLeader = idx === 0;
                const isYou = pid === humanId;
                return (
                  <div
                    key={pid}
                    className={`gb-avatar-bar-item${isActive ? ' gb-avatar-bar-active' : ''}${isYou ? ' gb-avatar-bar-you' : ''}${timeoutCollapseActive && isTimeoutPlayer(pid) ? ' gb-avatar-bar-timeout' : ''}`}
                    title={getName(pid)}
                    role="listitem"
                    aria-label={`${getName(pid)}${isActive ? ' — current turn' : ''}${isLeader ? ', leader' : ''}`}
                  >
                    {isLeader && (
                      <span className="gb-avatar-bar-crown" aria-hidden="true">👑</span>
                    )}
                    <GlassBridgeAvatar
                      id={pid}
                      name={getName(pid)}
                      alt={getName(pid)}
                      size={32}
                    />
                    {isYou && (
                      <span className="gb-avatar-bar-you-badge" aria-hidden="true">YOU</span>
                    )}
                  </div>
                );
              })}
          </div>

          {isHumanTurn && !isHumanEliminated && (
            <div className="gb-step-hint" aria-live="polite">
              Choose directly on the path.
            </div>
          )}

        </div>
      )}

      {/* ── Complete ── */}
      {gb.phase === 'complete' && (
        <MinigameCompleteWrapper
          className="gb-complete"
          onContinue={() => {
            // Ensure outcome is applied before MinigameHost unmounts this component.
            dispatch(resolveGlassBridgeOutcome());
            onComplete?.();
          }}
          continueLabel="Continue"
          continueButtonClassName="gb-btn-primary"
          placementsClassName="gb-placement-list"
          placementsRole="list"
          placementsAriaLabel="Final placements"
          placementsNode={gb.placements.map((pid, idx) => {
            const p = gb.progress[pid];
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
            const isYou = pid === humanId;
            const hintUses = getHintUses(p?.hintPenaltyMs);

            const detail: string = p?.finishTimeMs !== undefined
              ? (() => {
                  const penalty = p.hintPenaltyMs ?? 0;
                  const effective = p.finishTimeMs + penalty;
                  const base = `Finished ${formatElapsed(effective)}`;
                  return hintUses > 0
                    ? `${base} (${formatHintUsage(hintUses)}, +${penalty / 1000}s)`
                    : base;
                })()
              : p?.furthestRowReached
                ? `Row ${p.furthestRowReached}${hintUses > 0 ? ` • ${formatHintUsage(hintUses)}` : ''}`
                : 'Row 0';

            return (
              <div key={pid} className="gb-placement-item" role="listitem">
                <span className="gb-placement-rank">{medal}</span>
                <span className="gb-placement-name">
                  {isYou ? 'You' : getName(pid)}
                </span>
                <span className="gb-placement-detail">{detail}</span>
              </div>
            );
          })}
        >
          <div className="gb-complete-hero">
            <h2>Path Complete</h2>
            <div className="gb-winner-badge">🏆</div>
            {gb.winnerId && (
              <div className="gb-winner-name">
                {gb.winnerId === humanId ? 'You win!' : `${getName(gb.winnerId)} wins!`}
              </div>
            )}
            <div className="gb-complete-subtitle">
              Finishers are ranked by time. Everyone else is ranked by progress.
            </div>
          </div>
        </MinigameCompleteWrapper>
      )}

      {/* ── Spectator modal ── */}
      {showSpectatorModal && (
        <div
          className="gb-spectator-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Eliminated"
        >
          <div className="gb-spectator-card">
            <div className="gb-spectator-icon" aria-hidden="true">💀</div>
            <h2>You have been eliminated.</h2>
            <p>You can continue watching the remaining players cross the path.</p>
            <div className="gb-spectator-actions">
              <button
                className="gb-btn-watch"
                onClick={handleContinueWatching}
                aria-label="Continue watching"
              >
                Continue Watching
              </button>
              <button
                className="gb-btn-skip"
                onClick={handleSkipToResult}
                aria-label="Skip to result"
              >
                Skip to Result
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Elimination flash ── */}
      {showEliminationFlash && (
        <div className="gb-elimination-flash" aria-hidden="true" />
      )}
    </div>
  );
}
