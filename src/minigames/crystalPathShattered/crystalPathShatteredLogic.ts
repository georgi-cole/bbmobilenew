import type {
  BridgeRow,
  GlassBridgePlayerProgress,
  GlassBridgeState,
  TileSide,
} from '../../features/glassBridge/glassBridgeSlice';

export const ORDER_AI_PICK_SLOW_MS = 2_500;
export const ORDER_AI_PICK_FAST_MS = 350;
export const ORDER_REVEAL_DELAY_MS = 600;
export const REVEAL_STAGGER_MS = 350;
export const REVEAL_TO_PLAY_DELAY_MS = 1_800;
export const STEP_SUSPENSE_DELAY_MS = 320;
export const SAFE_CONFIRM_MS = 520;
export const SAFE_SETTLE_MS = 220;
export const WRONG_CRACK_MS = 320;
export const WRONG_SHATTER_MS = 360;
export const WRONG_FALL_MS = 950;
export const WRONG_SETTLE_MS = 240;
export const TIMEOUT_ROW_BREAK_STAGGER_MS = 60;
export const TIMEOUT_SIDE_BREAK_OFFSET_MS = 24;
export const SHATTER_ANIM_MS = WRONG_CRACK_MS + WRONG_SHATTER_MS;
export const POST_SHATTER_DELAY_MS = WRONG_SETTLE_MS;

export interface CrystalPathShatteredAnimation {
  type: 'safe' | 'wrong' | 'timeout';
  side: TileSide;
  rowIndex: number;
  playerId: string;
  startedAt: number;
}

export function getWrongSequenceMs(): number {
  return STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS + WRONG_FALL_MS + WRONG_SETTLE_MS;
}

export function getSafeSequenceMs(): number {
  return STEP_SUSPENSE_DELAY_MS + SAFE_CONFIRM_MS + SAFE_SETTLE_MS;
}

export function getHintUses(hintPenaltyMs: number | undefined): number {
  return Math.min(3, Math.floor((hintPenaltyMs ?? 0) / 30_000));
}

export function computeHintLeftBreakChance(safeSide: TileSide, sameRowHintCount: number): number {
  const tierIndex = Math.min(2, Math.max(0, sameRowHintCount - 1));
  const leftBreakChanceByTier = safeSide === 'right'
    ? [65, 90, 99]
    : [35, 10, 1];
  return leftBreakChanceByTier[tierIndex];
}

export function chooseSideFromHint(safeSide: TileSide, sameRowHintCount: number, rng: () => number): TileSide {
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

export function getAiDecisionDelayMs(
  row: Pick<BridgeRow, 'leftBroken' | 'rightBroken' | 'revealedSafeSide'>,
  rng: () => number,
): number {
  const [minDelay, maxDelay] = row.leftBroken !== row.rightBroken
    ? [100, 1_000]
    : row.revealedSafeSide
      ? [350, 1_750]
      : [100, 3_000];
  return minDelay + Math.floor(rng() * (maxDelay - minDelay));
}

export function getTimeoutCollapseDuration(rowsCount: number): number {
  const finalTileDelay = Math.max(0, rowsCount - 1) * TIMEOUT_ROW_BREAK_STAGGER_MS
    + TIMEOUT_SIDE_BREAK_OFFSET_MS;
  return finalTileDelay + SHATTER_ANIM_MS + POST_SHATTER_DELAY_MS;
}

export function getNextPlaybackSpeed(currentSpeed: 1 | 2 | 3): 1 | 2 | 3 {
  if (currentSpeed === 1) return 2;
  if (currentSpeed === 2) return 3;
  return 1;
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return `${m}:${ss}`;
}

export function formatTimeRemaining(remaining: number): string {
  if (remaining <= 0) return '0:00';
  return formatElapsed(remaining);
}

export function formatHintUsage(hintUses: number): string {
  if (hintUses <= 0) return 'No hints';
  if (hintUses === 1) return '1 hint';
  return `${hintUses} hints`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

export function buildTokenStack(
  state: GlassBridgeState,
  activePlayerId: string | null,
  activeAnimation: CrystalPathShatteredAnimation | null,
): Array<{
  playerId: string;
  name: string;
  rowIndex: number;
  side: TileSide | 'center';
  finished: boolean;
  active: boolean;
  eliminated: boolean;
  stackIndex: number;
}> {
  const stacks = new Map<string, number>();

  return state.participants.flatMap((participant) => {
    const progress = state.progress[participant.id];
    if (!progress) return [];
    const inAnimation = activeAnimation?.playerId === participant.id;
    if (progress.eliminated && !inAnimation) return [];

    const finished = progress.finishTimeMs !== undefined;
    const rowIndex = finished ? state.rowsCount : Math.max(0, progress.furthestRowReached);
    const side: TileSide | 'center' = rowIndex <= 0
      ? 'center'
      : state.rows[Math.min(rowIndex - 1, state.rows.length - 1)]?.safeSide ?? 'center';
    const stackKey = `${rowIndex}-${side}`;
    const stackIndex = stacks.get(stackKey) ?? 0;
    stacks.set(stackKey, stackIndex + 1);

    return [{
      playerId: participant.id,
      name: participant.name,
      rowIndex,
      side,
      finished,
      active: participant.id === activePlayerId,
      eliminated: progress.eliminated,
      stackIndex,
    }];
  });
}

export function getPlacementDetail(progress: GlassBridgePlayerProgress | undefined): string {
  if (!progress) return 'Row 0';
  const hintUses = getHintUses(progress.hintPenaltyMs);
  if (progress.finishTimeMs !== undefined) {
    const penalty = progress.hintPenaltyMs ?? 0;
    const effective = progress.finishTimeMs + penalty;
    const base = `Finished ${formatElapsed(effective)}`;
    return hintUses > 0 ? `${base} (${formatHintUsage(hintUses)}, +${penalty / 1000}s)` : base;
  }
  return progress.furthestRowReached
    ? `Row ${progress.furthestRowReached}${hintUses > 0 ? ` • ${formatHintUsage(hintUses)}` : ''}`
    : 'Row 0';
}
