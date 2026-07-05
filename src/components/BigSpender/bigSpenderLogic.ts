import { mulberry32 } from '../../store/rng';

export const BIG_SPENDER_GAME_ID = 'big_spender_broke_or_boom';
export const BIG_SPENDER_DISPLAY_NAME = 'Big Spender: Broke or Boom';

export const BIG_SPENDER_CONFIG = {
  startingBalance: 1200,
  boardSize: 32,
  minWalletsBeforeLock: 8,
  finalRound: 5,
  roundFourFinalistCount: 2,
  outcomeWeights: {
    negative: 75,
    positive: 20,
    bomb: 5,
  },
  bonusExtraWalletChance: 0,
  maxExtraWalletsPerTurn: 1,
  maxAdBombRescues: 2,
} as const;

const BIG_SPENDER_FINALE_BOARD_ID = '__big_spender_finale_board__';

export const BIG_SPENDER_NEGATIVE_WALLETS = [
  { amount: -25, weight: 2 },
  { amount: -37, weight: 2 },
  { amount: -50, weight: 5 },
  { amount: -69, weight: 5 },
  { amount: -75, weight: 5 },
  { amount: -100, weight: 10 },
  { amount: -123, weight: 6 },
  { amount: -150, weight: 12 },
  { amount: -175, weight: 8 },
  { amount: -200, weight: 12 },
  { amount: -222, weight: 6 },
  { amount: -250, weight: 10 },
  { amount: -300, weight: 7 },
  { amount: -333, weight: 4 },
  { amount: -404, weight: 3 },
  { amount: -420, weight: 2 },
  { amount: -666, weight: 1 },
] as const;

export const BIG_SPENDER_POSITIVE_WALLETS = [
  { amount: 25, weight: 8 },
  { amount: 37, weight: 5 },
  { amount: 50, weight: 13 },
  { amount: 69, weight: 6 },
  { amount: 75, weight: 10 },
  { amount: 100, weight: 15 },
  { amount: 123, weight: 8 },
  { amount: 150, weight: 12 },
  { amount: 175, weight: 6 },
  { amount: 200, weight: 7 },
  { amount: 222, weight: 3 },
  { amount: 250, weight: 3 },
  { amount: 300, weight: 2 },
  { amount: 404, weight: 1 },
  { amount: 666, weight: 1 },
] as const;

export const BIG_SPENDER_FUNNY_AMOUNTS = new Set([69, 123, 222, 333, 404, 420, 666]);

const AI_NEGATIVE_BROADCASTS = [
  '{name} found a receipt with bad handwriting.',
  '{name} heard the wallet sigh.',
  '{name} made the house accountants smile.',
  '{name} opened one and looked suddenly humble.',
  '{name} discovered a service fee with stage presence.',
  '{name} picked a wallet that asked for a manager.',
  '{name} found the budget spreadsheet crying.',
  '{name} opened one and immediately blamed production.',
  '{name} found a coupon that expired in 2009.',
  '{name} just made zero look fashionable.',
] as const;

const AI_POSITIVE_BROADCASTS = [
  '{name} found suspicious cashback.',
  '{name} got a wallet that fought back.',
  '{name} accidentally made things worse.',
  '{name} opened one and the room got nosy.',
  '{name} found money with excellent timing.',
  '{name} got a tiny financial plot twist.',
  '{name} found a wallet that clearly has favorites.',
  '{name} opened one and tried not to smile.',
  '{name} just bought themselves a little breathing room.',
  '{name} found the house\'s emergency snack fund.',
] as const;

const AI_BOMB_BROADCASTS = [
  'Rumors say {name} heard a very suspicious beep.',
  'A tiny boom echoed somewhere near {name}.',
  '{name} found the wallet with commitment issues.',
  'The house just went quiet around {name}.',
  '{name} opened one and everyone suddenly remembered errands.',
  'A producer just asked whether {name} signed the waiver.',
  '{name} found the spicy wallet.',
  'Something near {name} made a very final noise.',
] as const;

export type BigSpenderOutcomeType = 'negative' | 'positive' | 'bomb';
export type BigSpenderWalletKind = 'normal' | 'bonus' | 'secondChance';
export type BigSpenderWalletState = 'hidden' | 'opening' | 'revealed';
export type BigSpenderPlayerStatus = 'active' | 'locked' | 'zeroFinished' | 'bombed';
export type BigSpenderGameStatus = 'running' | 'roundSummary' | 'completed';
export type BigSpenderAdDecision = 'completed' | 'declined' | 'failed' | 'unavailable';

export interface BigSpenderParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  avatar?: string;
  precomputedScore?: number;
}

export interface BigSpenderWalletOutcome {
  type: BigSpenderOutcomeType;
  amount: number | null;
}

export interface BigSpenderWallet {
  walletId: string;
  boardSlotIndex: number;
  generationNumber: number;
  generationColor: number;
  outcome: BigSpenderWalletOutcome;
  state: BigSpenderWalletState;
  openedByPlayerId: string | null;
}

export interface BigSpenderPlayerState {
  playerId: string;
  displayName: string;
  isHuman: boolean;
  avatar?: string;
  balance: number;
  status: BigSpenderPlayerStatus;
  walletsOpened: number;
  negativeWalletsOpened: number;
  positiveWalletsOpened: number;
  bombsOpened: number;
  bonusWalletsOpened: number;
  adBombRescuesUsed: number;
  bombedAt: number | null;
  lockedAt: number | null;
  zeroFinishedAt: number | null;
  finalizedAt: number | null;
  eliminatedRound: number | null;
  gameRank: number | null;
  originalTurnOrderIndex: number;
  currentTurn: boolean;
}

export interface BigSpenderRoundResult {
  roundNumber: number;
  finalistRound: boolean;
  rankedPlayerIds: string[];
  eliminatedPlayerIds: string[];
  survivorPlayerIds: string[];
}

export interface BigSpenderPendingBonus {
  playerId: string;
  walletId: string;
}

export interface BigSpenderPendingAdRescue {
  playerId: string;
  walletId: string;
}

export interface BigSpenderPendingSecondChance {
  playerId: string;
  sourceWalletId: string;
}

export interface BigSpenderEvent {
  type:
    | 'walletOpened'
    | 'walletReplaced'
    | 'bonusOffered'
    | 'bonusDeclined'
    | 'adRescueOffered'
    | 'adRescueCompleted'
    | 'adRescueFailed'
    | 'secondChanceReady'
    | 'playerLocked'
    | 'playerZeroFinished'
    | 'playerBombed'
    | 'roundCompleted'
    | 'playerEliminated'
    | 'gameCompleted'
    | 'turnAdvanced';
  playerId?: string;
  walletId?: string;
  outcome?: BigSpenderWalletOutcome;
  message: string;
}

export interface BigSpenderState {
  gameId: string;
  status: BigSpenderGameStatus;
  seed: number;
  randomCursor: number;
  actionOrder: number;
  roundNumber: number;
  startingPlayerCount: number;
  turnOrder: string[];
  currentTurnIndex: number;
  currentTurnPlayerId: string | null;
  activePlayerIds: string[];
  eliminatedPlayerIds: string[];
  roundResults: BigSpenderRoundResult[];
  players: BigSpenderPlayerState[];
  board: BigSpenderWallet[];
  boardsByPlayerId: Record<string, BigSpenderWallet[]>;
  pendingBonus: BigSpenderPendingBonus | null;
  pendingAdRescue: BigSpenderPendingAdRescue | null;
  pendingSecondChance: BigSpenderPendingSecondChance | null;
  postWalletLockPlayerId: string | null;
  events: BigSpenderEvent[];
}

export interface BigSpenderOpenOptions {
  forcedOutcome?: BigSpenderWalletOutcome;
  forceBonusOffer?: boolean;
  suppressBonus?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function appendEvent(state: BigSpenderState, event: BigSpenderEvent) {
  state.events = [event, ...state.events].slice(0, 16);
}

function getOutcomeMessage(player: BigSpenderPlayerState, outcome: BigSpenderWalletOutcome, kind: BigSpenderWalletKind) {
  if (outcome.type === 'bomb' && player.isHuman && kind === 'secondChance') return 'Your Second Chance Wallet had a bomb.';
  if (outcome.type === 'bomb' && player.isHuman) return 'You opened a bomb.';
  if (outcome.type === 'bomb') return getAiBroadcastLine(player, AI_BOMB_BROADCASTS);
  const amount = outcome.amount ?? 0;
  if (player.isHuman && kind === 'secondChance' && amount < 0) return `Second Chance Wallet: ${amount} Eyeoleans.`;
  if (player.isHuman && kind === 'secondChance') return `Second Chance Wallet: +${amount} Eyeoleans.`;
  if (player.isHuman && amount < 0) return `You opened ${amount} Eyeoleans.`;
  if (player.isHuman) return `You found +${amount} Eyeoleans.`;
  return getAiBroadcastLine(player, outcome.type === 'negative' ? AI_NEGATIVE_BROADCASTS : AI_POSITIVE_BROADCASTS);
}

function getAiBroadcastLine(player: BigSpenderPlayerState, lines: readonly string[]) {
  const template = lines[Math.max(0, player.walletsOpened - 1) % lines.length] ?? '{name} opened a wallet.';
  return template.replace('{name}', player.displayName);
}

function nextRandom(state: BigSpenderState) {
  const seed = (state.seed + Math.imul(state.randomCursor + 1, 0x9e3779b1)) >>> 0;
  state.randomCursor += 1;
  return mulberry32(seed)();
}

function weightedPick<T extends { weight: number }>(items: readonly T[], roll: number): T {
  const total = sumWeights(items);
  let target = roll * total;
  for (const item of items) {
    target -= item.weight;
    if (target < 0) return item;
  }
  return items[items.length - 1]!;
}

function cloneState(state: BigSpenderState): BigSpenderState {
  return {
    ...state,
    turnOrder: [...state.turnOrder],
    activePlayerIds: [...state.activePlayerIds],
    eliminatedPlayerIds: [...state.eliminatedPlayerIds],
    roundResults: state.roundResults.map((round) => ({
      ...round,
      rankedPlayerIds: [...round.rankedPlayerIds],
      eliminatedPlayerIds: [...round.eliminatedPlayerIds],
      survivorPlayerIds: [...round.survivorPlayerIds],
    })),
    players: state.players.map((player) => ({ ...player })),
    board: state.board.map((wallet) => ({ ...wallet, outcome: { ...wallet.outcome } })),
    boardsByPlayerId: Object.fromEntries(
      Object.entries(state.boardsByPlayerId).map(([playerId, board]) => [
        playerId,
        board.map((wallet) => ({ ...wallet, outcome: { ...wallet.outcome } })),
      ]),
    ),
    pendingBonus: state.pendingBonus ? { ...state.pendingBonus } : null,
    pendingAdRescue: state.pendingAdRescue ? { ...state.pendingAdRescue } : null,
    pendingSecondChance: state.pendingSecondChance ? { ...state.pendingSecondChance } : null,
    events: [...state.events],
  };
}

function isFinaleRound(state: BigSpenderState) {
  return state.roundNumber === BIG_SPENDER_CONFIG.finalRound;
}

function isRoundParticipant(state: BigSpenderState, playerId: string) {
  return state.activePlayerIds.includes(playerId);
}

function getBoardOwnerId(state: BigSpenderState, _playerId: string) {
  return isFinaleRound(state) ? BIG_SPENDER_FINALE_BOARD_ID : _playerId;
}

function getPlayerMutable(state: BigSpenderState, playerId: string) {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) throw new Error(`Big Spender player '${playerId}' not found.`);
  return player;
}

function getBoardMutable(state: BigSpenderState, playerId: string) {
  const board = state.boardsByPlayerId[getBoardOwnerId(state, playerId)];
  if (!board) throw new Error(`Big Spender board for '${playerId}' not found.`);
  return board;
}

function getWalletMutable(state: BigSpenderState, playerId: string, walletId: string) {
  const wallet = getBoardMutable(state, playerId).find((entry) => entry.walletId === walletId);
  if (!wallet) throw new Error(`Big Spender wallet '${walletId}' not found.`);
  return wallet;
}

function syncVisibleBoard(state: BigSpenderState) {
  const humanPlayer = state.players.find((player) => player.isHuman) ?? state.players[0];
  state.board = humanPlayer ? state.boardsByPlayerId[getBoardOwnerId(state, humanPlayer.playerId)] ?? [] : [];
}

function markTurnFlags(state: BigSpenderState) {
  for (const player of state.players) {
    player.currentTurn = isRoundParticipant(state, player.playerId) && player.playerId === state.currentTurnPlayerId;
  }
}

function nextEligibleTurnIndex(state: BigSpenderState, startIndex: number) {
  if (state.turnOrder.length === 0) return -1;
  for (let offset = 0; offset < state.turnOrder.length; offset += 1) {
    const index = (startIndex + offset) % state.turnOrder.length;
    const id = state.turnOrder[index];
    const player = state.players.find((entry) => entry.playerId === id);
    if (player && isRoundParticipant(state, player.playerId) && player.status === 'active' && player.finalizedAt == null) return index;
  }
  return -1;
}

function startNextRoundMutable(state: BigSpenderState, survivorPlayerIds: string[]) {
  state.status = 'running';
  state.roundNumber = survivorPlayerIds.length <= BIG_SPENDER_CONFIG.roundFourFinalistCount
    ? BIG_SPENDER_CONFIG.finalRound
    : state.roundNumber + 1;
  state.actionOrder = 0;
  state.activePlayerIds = [...survivorPlayerIds];
  state.turnOrder = [...survivorPlayerIds];
  state.currentTurnIndex = 0;
  state.currentTurnPlayerId = isFinaleRound(state) ? survivorPlayerIds[0] ?? null : null;
  state.pendingBonus = null;
  state.pendingAdRescue = null;
  state.pendingSecondChance = null;
  state.postWalletLockPlayerId = null;

  const rng = () => nextRandom(state);
  state.players = state.players.map((player) => {
    if (!survivorPlayerIds.includes(player.playerId)) return { ...player, currentTurn: false };
    return resetPlayerForRound(player, survivorPlayerIds.indexOf(player.playerId));
  });

  state.boardsByPlayerId = {
    ...state.boardsByPlayerId,
    ...Object.fromEntries(
      survivorPlayerIds.map((playerId) => [playerId, createBoardForOwner(playerId, state.roundNumber, rng)]),
    ),
  };
  if (isFinaleRound(state)) {
    state.boardsByPlayerId[BIG_SPENDER_FINALE_BOARD_ID] = createBoardForOwner(BIG_SPENDER_FINALE_BOARD_ID, state.roundNumber, rng);
  }
  markTurnFlags(state);
  syncVisibleBoard(state);
  appendEvent(state, {
    type: 'roundCompleted',
    message: isFinaleRound(state) ? 'Finale round: the last two share one board.' : `Round ${state.roundNumber} begins.`,
  });
  return state;
}

function completeRoundMutable(state: BigSpenderState) {
  const roundPlayers = state.players.filter((player) => state.activePlayerIds.includes(player.playerId));
  const ranked = rankBigSpenderPlayers(roundPlayers);
  const isFinalRound = isFinaleRound(state);

  if (isFinalRound) {
    for (const [index, rankedPlayer] of ranked.entries()) {
      const player = getPlayerMutable(state, rankedPlayer.playerId);
      player.gameRank = index + 1;
      player.eliminatedRound = null;
    }
    state.roundResults.push({
      roundNumber: state.roundNumber,
      finalistRound: true,
      rankedPlayerIds: ranked.map((player) => player.playerId),
      eliminatedPlayerIds: [],
      survivorPlayerIds: [],
    });
    state.status = 'completed';
    state.currentTurnPlayerId = null;
    state.postWalletLockPlayerId = null;
    state.pendingBonus = null;
    state.pendingAdRescue = null;
    state.pendingSecondChance = null;
    markTurnFlags(state);
    syncVisibleBoard(state);
    appendEvent(state, { type: 'gameCompleted', message: 'The finale is complete.' });
    return state;
  }

  const eliminateCount = state.roundNumber >= 4
    ? Math.max(0, ranked.length - BIG_SPENDER_CONFIG.roundFourFinalistCount)
    : Math.min(1, Math.max(0, ranked.length - BIG_SPENDER_CONFIG.roundFourFinalistCount));
  const survivorPlayerIds = ranked.slice(0, Math.max(0, ranked.length - eliminateCount)).map((player) => player.playerId);
  const eliminatedThisRound = ranked.slice(survivorPlayerIds.length);

  for (const [index, eliminated] of eliminatedThisRound.entries()) {
    const player = getPlayerMutable(state, eliminated.playerId);
    player.eliminatedRound = state.roundNumber;
    player.gameRank = survivorPlayerIds.length + index + 1;
    state.eliminatedPlayerIds.push(player.playerId);
    appendEvent(state, {
      type: 'playerEliminated',
      playerId: player.playerId,
      message: `${player.displayName} is eliminated in Round ${state.roundNumber}.`,
    });
  }

  state.roundResults.push({
    roundNumber: state.roundNumber,
    finalistRound: false,
    rankedPlayerIds: ranked.map((player) => player.playerId),
    eliminatedPlayerIds: eliminatedThisRound.map((player) => player.playerId),
    survivorPlayerIds,
  });
  state.status = 'roundSummary';
  state.currentTurnPlayerId = null;
  state.postWalletLockPlayerId = null;
  state.pendingBonus = null;
  state.pendingAdRescue = null;
  state.pendingSecondChance = null;
  markTurnFlags(state);
  syncVisibleBoard(state);
  appendEvent(state, {
    type: 'roundCompleted',
    message: `Round ${state.roundNumber} is complete.`,
  });
  return state;
}

function continueRoundSummaryMutable(state: BigSpenderState) {
  if (state.status !== 'roundSummary') return state;
  const latestRound = state.roundResults[state.roundResults.length - 1];
  if (!latestRound) return state;
  return startNextRoundMutable(state, latestRound.survivorPlayerIds);
}

function completeIfNeeded(state: BigSpenderState) {
  for (const player of state.players) {
    if (!isRoundParticipant(state, player.playerId)) continue;
    const hiddenWallets = getBigSpenderBoardForPlayer(state, player.playerId).some((wallet) => wallet.state === 'hidden');
    if (
      player.status === 'active' &&
      player.finalizedAt == null &&
      !hiddenWallets &&
      state.pendingSecondChance?.playerId !== player.playerId
    ) {
      finalizePlayer(player, state, 'locked');
    }
  }
  const unresolved = state.players.filter((player) =>
    isRoundParticipant(state, player.playerId) &&
    player.status === 'active' &&
    player.finalizedAt == null
  );
  if (unresolved.length > 0) return state;
  return completeRoundMutable(state);
}

function advanceTurnMutable(state: BigSpenderState) {
  state.postWalletLockPlayerId = null;
  if (state.status === 'completed') return completeIfNeeded(state);
  const nextIndex = nextEligibleTurnIndex(state, state.currentTurnIndex + 1);
  if (nextIndex < 0) return completeIfNeeded(state);
  state.currentTurnIndex = nextIndex;
  state.currentTurnPlayerId = state.turnOrder[nextIndex] ?? null;
  markTurnFlags(state);
  appendEvent(state, {
    type: 'turnAdvanced',
    playerId: state.currentTurnPlayerId ?? undefined,
    message: `${getPlayerMutable(state, state.currentTurnPlayerId ?? '').displayName} is up.`,
  });
  return state;
}

function advanceFinaleTurnMutable(state: BigSpenderState) {
  if (!isFinaleRound(state) || state.status === 'completed') return state;
  const nextIndex = nextEligibleTurnIndex(state, state.currentTurnIndex + 1);
  if (nextIndex < 0) return completeIfNeeded(state);
  state.currentTurnIndex = nextIndex;
  state.currentTurnPlayerId = state.turnOrder[nextIndex] ?? null;
  markTurnFlags(state);
  return state;
}

function createWalletFromRoll(slotIndex: number, generationNumber: number, playerId: string, rng: () => number, roundNumber: number): BigSpenderWallet {
  const outcome = pickWalletOutcome(rng);
  return {
    walletId: `${playerId}-round-${roundNumber}-wallet-${slotIndex}-${generationNumber}`,
    boardSlotIndex: slotIndex,
    generationNumber,
    generationColor: generationNumber % 6,
    outcome,
    state: 'hidden',
    openedByPlayerId: null,
  };
}

function createBoardForOwner(ownerId: string, roundNumber: number, rng: () => number) {
  return Array.from({ length: BIG_SPENDER_CONFIG.boardSize }, (_unused, slotIndex) =>
    createWalletFromRoll(slotIndex, roundNumber, ownerId, rng, roundNumber),
  );
}

function resetPlayerForRound(player: BigSpenderPlayerState, roundIndex: number): BigSpenderPlayerState {
  return {
    ...player,
    balance: BIG_SPENDER_CONFIG.startingBalance,
    status: 'active',
    walletsOpened: 0,
    negativeWalletsOpened: 0,
    positiveWalletsOpened: 0,
    bombsOpened: 0,
    bonusWalletsOpened: 0,
    bombedAt: null,
    lockedAt: null,
    zeroFinishedAt: null,
    finalizedAt: null,
    currentTurn: false,
    originalTurnOrderIndex: roundIndex,
  };
}

function finalizePlayer(player: BigSpenderPlayerState, state: BigSpenderState, status: BigSpenderPlayerStatus) {
  state.actionOrder += 1;
  player.status = status;
  player.finalizedAt = state.actionOrder;
  if (status === 'locked') player.lockedAt = state.actionOrder;
  if (status === 'zeroFinished') player.zeroFinishedAt = state.actionOrder;
  if (status === 'bombed') player.bombedAt = state.actionOrder;
}

function maybeOfferBonus(state: BigSpenderState, player: BigSpenderPlayerState, openedWallet: BigSpenderWallet, options: BigSpenderOpenOptions) {
  if (options.suppressBonus || state.status !== 'running' || player.status !== 'active') return false;
  const offered = options.forceBonusOffer ?? nextRandom(state) < BIG_SPENDER_CONFIG.bonusExtraWalletChance;
  if (!offered) return false;
  state.pendingBonus = { playerId: player.playerId, walletId: openedWallet.walletId };
  appendEvent(state, {
    type: 'bonusOffered',
    playerId: player.playerId,
    walletId: openedWallet.walletId,
    message: `${player.displayName} found a bonus wallet offer.`,
  });
  return true;
}

function resolveSyntheticWalletMutable(
  state: BigSpenderState,
  player: BigSpenderPlayerState,
  outcome: BigSpenderWalletOutcome,
  kind: BigSpenderWalletKind,
) {
  applyOutcomeMutable(state, player, outcome, kind);
}

function applyOutcomeMutable(
  state: BigSpenderState,
  player: BigSpenderPlayerState,
  outcome: BigSpenderWalletOutcome,
  kind: BigSpenderWalletKind,
) {
  player.walletsOpened += 1;
  if (kind === 'bonus') player.bonusWalletsOpened += 1;

  if (outcome.type === 'positive') {
    player.positiveWalletsOpened += 1;
    player.balance += outcome.amount ?? 0;
    appendWalletOpenedEvent(state, player, outcome, kind);
    return;
  }

  if (outcome.type === 'negative') {
    player.negativeWalletsOpened += 1;
    player.balance = clamp(player.balance + (outcome.amount ?? 0), 0, Number.MAX_SAFE_INTEGER);
    appendWalletOpenedEvent(state, player, outcome, kind);
    if (player.balance === 0) {
      finalizePlayer(player, state, 'zeroFinished');
      appendEvent(state, {
        type: 'playerZeroFinished',
        playerId: player.playerId,
        message: `${player.displayName} hit zero first-class broke.`,
      });
    }
    return;
  }

  player.bombsOpened += 1;
  appendWalletOpenedEvent(state, player, outcome, kind);
}

function shouldBroadcastWalletOpened(state: BigSpenderState, player: BigSpenderPlayerState, outcome: BigSpenderWalletOutcome) {
  if (isFinaleRound(state)) return false;
  if (player.isHuman) return true;
  if (outcome.type === 'bomb') return true;
  return (player.walletsOpened + player.originalTurnOrderIndex + state.roundNumber) % 4 === 0;
}

function appendWalletOpenedEvent(
  state: BigSpenderState,
  player: BigSpenderPlayerState,
  outcome: BigSpenderWalletOutcome,
  kind: BigSpenderWalletKind,
) {
  if (!shouldBroadcastWalletOpened(state, player, outcome)) return;
  appendEvent(state, {
    type: 'walletOpened',
    playerId: player.playerId,
    outcome,
    message: getOutcomeMessage(player, outcome, kind),
  });
}

function markBombedMutable(state: BigSpenderState, player: BigSpenderPlayerState) {
  finalizePlayer(player, state, 'bombed');
  appendEvent(state, {
    type: 'playerBombed',
    playerId: player.playerId,
    message: `${player.displayName} is bombed out.`,
  });
}

function finishAfterResolution(state: BigSpenderState) {
  completeIfNeeded(state);
  if (state.status === 'completed' || state.pendingAdRescue || state.pendingBonus || state.pendingSecondChance) return state;
  if (isFinaleRound(state)) return advanceFinaleTurnMutable(state);
  markTurnFlags(state);
  return state;
}

export function sumWeights(items: readonly { weight: number }[]) {
  return items.reduce((total, item) => total + item.weight, 0);
}

export function getAiActionDelayMs(_startingPlayerCount: number, rng: () => number) {
  const [min, max] = [2400, 6500];
  return Math.round(min + rng() * (max - min));
}

export function pickWalletOutcome(rng: () => number): BigSpenderWalletOutcome {
  const outcomeType = weightedPick([
    { type: 'negative' as const, weight: BIG_SPENDER_CONFIG.outcomeWeights.negative },
    { type: 'positive' as const, weight: BIG_SPENDER_CONFIG.outcomeWeights.positive },
    { type: 'bomb' as const, weight: BIG_SPENDER_CONFIG.outcomeWeights.bomb },
  ], rng()).type;

  if (outcomeType === 'bomb') return { type: 'bomb', amount: null };
  const table: readonly { amount: number; weight: number }[] = outcomeType === 'negative'
    ? BIG_SPENDER_NEGATIVE_WALLETS
    : BIG_SPENDER_POSITIVE_WALLETS;
  const amount = weightedPick(table, rng()).amount;
  return { type: outcomeType, amount };
}

export function isFunnyAmount(amount: number | null | undefined) {
  return amount != null && BIG_SPENDER_FUNNY_AMOUNTS.has(Math.abs(amount));
}

export function getBigSpenderBoardForPlayer(state: BigSpenderState, playerId: string) {
  return state.boardsByPlayerId[getBoardOwnerId(state, playerId)] ?? [];
}

export function resolveBigSpenderParticipants(participants?: BigSpenderParticipant[], participantIds?: string[]) {
  if (participants && participants.length > 0) {
    return participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      isHuman: participant.isHuman,
      avatar: participant.avatar,
      precomputedScore: participant.precomputedScore ?? 50,
    }));
  }
  const ids = participantIds && participantIds.length > 0
    ? participantIds
    : ['human', 'ai-1', 'ai-2', 'ai-3'];
  return ids.map((id, index) => ({
    id,
    name: index === 0 ? 'You' : `AI ${index}`,
    isHuman: index === 0,
    avatar: undefined,
    precomputedScore: Math.max(10, 80 - index * 7),
  }));
}

export function createInitialBigSpenderState(
  participants: BigSpenderParticipant[],
  seed = Date.now(),
  _now = Date.now(),
): BigSpenderState {
  if (participants.length < 2) {
    throw new Error('Big Spender requires at least 2 players.');
  }
  const rng = mulberry32(seed >>> 0);
  const orderedParticipants = shuffle(participants, rng);
  const players = orderedParticipants.map((participant, index): BigSpenderPlayerState => ({
    playerId: participant.id,
    displayName: participant.name,
    isHuman: participant.isHuman,
    avatar: participant.avatar,
    balance: BIG_SPENDER_CONFIG.startingBalance,
    status: 'active',
    walletsOpened: 0,
    negativeWalletsOpened: 0,
    positiveWalletsOpened: 0,
    bombsOpened: 0,
    bonusWalletsOpened: 0,
    adBombRescuesUsed: 0,
    bombedAt: null,
    lockedAt: null,
    zeroFinishedAt: null,
    finalizedAt: null,
    eliminatedRound: null,
    gameRank: null,
    originalTurnOrderIndex: index,
    currentTurn: false,
  }));
  const boardsByPlayerId = Object.fromEntries(
    players.map((player) => [
      player.playerId,
      createBoardForOwner(player.playerId, 1, rng),
    ]),
  );
  const humanPlayerId = players.find((player) => player.isHuman)?.playerId ?? players[0]?.playerId ?? null;
  const state: BigSpenderState = {
    gameId: BIG_SPENDER_GAME_ID,
    status: 'running',
    seed,
    randomCursor: BIG_SPENDER_CONFIG.boardSize * participants.length + participants.length,
    actionOrder: 0,
    roundNumber: 1,
    startingPlayerCount: participants.length,
    turnOrder: players.map((player) => player.playerId),
    currentTurnIndex: 0,
    currentTurnPlayerId: null,
    activePlayerIds: players.map((player) => player.playerId),
    eliminatedPlayerIds: [],
    roundResults: [],
    players,
    board: humanPlayerId ? boardsByPlayerId[humanPlayerId] ?? [] : [],
    boardsByPlayerId,
    pendingBonus: null,
    pendingAdRescue: null,
    pendingSecondChance: null,
    postWalletLockPlayerId: null,
    events: [],
  };
  markTurnFlags(state);
  return state;
}

export function canOfferAdRescue(state: BigSpenderState, player: BigSpenderPlayerState) {
  return (
    player.isHuman &&
    !isFinaleRound(state) &&
    player.adBombRescuesUsed < BIG_SPENDER_CONFIG.maxAdBombRescues &&
    player.finalizedAt == null &&
    state.status === 'running'
  );
}

export function openBigSpenderWallet(
  previousState: BigSpenderState,
  playerId: string,
  walletId: string,
  kind: BigSpenderWalletKind = 'normal',
  options: BigSpenderOpenOptions = {},
) {
  const state = cloneState(previousState);
  if (state.status !== 'running') return state;
  const isSecondChancePick = kind === 'secondChance' && state.pendingSecondChance?.playerId === playerId;
  if (kind === 'secondChance' && !isSecondChancePick) return state;
  if (state.pendingAdRescue?.playerId === playerId || state.pendingBonus?.playerId === playerId) return state;
  if (state.pendingSecondChance?.playerId === playerId && !isSecondChancePick) return state;
  if (!isRoundParticipant(state, playerId)) return state;
  if (isFinaleRound(state) && state.currentTurnPlayerId !== playerId) return state;
  const player = getPlayerMutable(state, playerId);
  if (player.status !== 'active' || player.finalizedAt != null) return state;

  const wallet = getWalletMutable(state, playerId, walletId);
  if (wallet.state !== 'hidden') return state;
  wallet.state = 'opening';
  wallet.openedByPlayerId = playerId;
  const outcome = options.forcedOutcome ?? wallet.outcome;
  wallet.outcome = outcome;
  wallet.state = 'revealed';
  if (isSecondChancePick) state.pendingSecondChance = null;
  syncVisibleBoard(state);

  applyOutcomeMutable(state, player, outcome, kind);

  if (outcome.type === 'bomb') {
    if (kind !== 'secondChance' && canOfferAdRescue(state, player)) {
      state.pendingAdRescue = { playerId: player.playerId, walletId: wallet.walletId };
      appendEvent(state, {
        type: 'adRescueOffered',
        playerId: player.playerId,
        walletId: wallet.walletId,
        message: 'Watch an ad for one last wallet?',
      });
      return state;
    }
    markBombedMutable(state, player);
    return finishAfterResolution(state);
  }

  if (player.status === 'active' && kind === 'normal' && maybeOfferBonus(state, player, wallet, options)) {
    return state;
  }
  return finishAfterResolution(state);
}

export function resolveBigSpenderBonusOffer(previousState: BigSpenderState, accept: boolean, forcedOutcome?: BigSpenderWalletOutcome) {
  const state = cloneState(previousState);
  const pending = state.pendingBonus;
  if (!pending) return state;
  state.pendingBonus = null;
  const player = getPlayerMutable(state, pending.playerId);
  if (!accept || player.status !== 'active') {
    appendEvent(state, {
      type: 'bonusDeclined',
      playerId: pending.playerId,
      message: `${player.displayName} declined the bonus wallet.`,
    });
    return finishAfterResolution(state);
  }

  const outcome = forcedOutcome ?? pickWalletOutcome(() => nextRandom(state));
  resolveSyntheticWalletMutable(state, player, outcome, 'bonus');
  if (outcome.type === 'bomb') markBombedMutable(state, player);
  return finishAfterResolution(state);
}

export function resolveBigSpenderAdRescue(
  previousState: BigSpenderState,
  decision: BigSpenderAdDecision,
) {
  const state = cloneState(previousState);
  const pending = state.pendingAdRescue;
  if (!pending) return state;
  state.pendingAdRescue = null;
  const player = getPlayerMutable(state, pending.playerId);

  if (decision !== 'completed' || player.status !== 'active') {
    appendEvent(state, {
      type: 'adRescueFailed',
      playerId: player.playerId,
      message: `${player.displayName} did not complete the ad save.`,
    });
    markBombedMutable(state, player);
    return finishAfterResolution(state);
  }

  player.adBombRescuesUsed += 1;
  appendEvent(state, {
    type: 'adRescueCompleted',
    playerId: player.playerId,
    message: `${player.displayName} earned a Second Chance pick.`,
  });
  const hiddenWallets = getBoardMutable(state, player.playerId).some((wallet) => wallet.state === 'hidden');
  if (!hiddenWallets) {
    markBombedMutable(state, player);
    return finishAfterResolution(state);
  }
  state.pendingSecondChance = { playerId: player.playerId, sourceWalletId: pending.walletId };
  appendEvent(state, {
    type: 'secondChanceReady',
    playerId: player.playerId,
    walletId: pending.walletId,
    message: `${player.displayName} is choosing a Second Chance Wallet.`,
  });
  syncVisibleBoard(state);
  return state;
}

export function finishBigSpenderTurn(previousState: BigSpenderState) {
  const state = cloneState(previousState);
  return advanceTurnMutable(state);
}

export function continueBigSpenderRound(previousState: BigSpenderState) {
  const state = cloneState(previousState);
  return continueRoundSummaryMutable(state);
}

export function lockBigSpenderPlayer(previousState: BigSpenderState, playerId: string) {
  const state = cloneState(previousState);
  const player = getPlayerMutable(state, playerId);
  if (state.status !== 'running' || player.status !== 'active' || player.finalizedAt != null) return state;
  if (!isRoundParticipant(state, playerId)) return state;
  if (isFinaleRound(state) && state.currentTurnPlayerId !== playerId) return state;
  if (state.pendingSecondChance?.playerId === playerId) return state;
  if (player.walletsOpened < BIG_SPENDER_CONFIG.minWalletsBeforeLock) return state;
  finalizePlayer(player, state, 'locked');
  if (state.currentTurnPlayerId === playerId) {
    state.currentTurnPlayerId = null;
    markTurnFlags(state);
  }
  appendEvent(state, {
    type: 'playerLocked',
    playerId,
    message: `${player.displayName} stepped away after ${player.walletsOpened} wallets.`,
  });
  completeIfNeeded(state);
  if ((state as BigSpenderState).status === 'completed') return state;
  if (isFinaleRound(state)) return advanceFinaleTurnMutable(state);
  return state;
}

export function decideAiShouldOpen(balance: number, rng: () => number) {
  const openChance = balance >= 901 ? 0.94 : balance >= 501 ? 0.82 : balance >= 151 ? 0.64 : 0.38;
  return rng() < openChance;
}

function simulateAiPlayerToFinalized(state: BigSpenderState, player: BigSpenderPlayerState) {
  const board = getBoardMutable(state, player.playerId);
  let guard = 0;
  while (state.status === 'running' && player.status === 'active' && player.finalizedAt == null && guard < BIG_SPENDER_CONFIG.boardSize) {
    guard += 1;
    const hiddenWallets = board.filter((wallet) => wallet.state === 'hidden');
    if (hiddenWallets.length === 0) break;
    const mustOpen = player.walletsOpened < BIG_SPENDER_CONFIG.minWalletsBeforeLock;
    if (!mustOpen && !decideAiShouldOpen(player.balance, () => nextRandom(state))) break;
    const wallet = hiddenWallets[Math.floor(nextRandom(state) * hiddenWallets.length)] ?? hiddenWallets[0]!;
    wallet.state = 'revealed';
    wallet.openedByPlayerId = player.playerId;
    applyOutcomeMutable(state, player, wallet.outcome, 'normal');
    if (wallet.outcome.type === 'bomb') {
      markBombedMutable(state, player);
      break;
    }
  }

  if (state.status === 'running' && player.status === 'active' && player.finalizedAt == null) {
    finalizePlayer(player, state, 'locked');
    appendEvent(state, {
      type: 'playerLocked',
      playerId: player.playerId,
      message: `${player.displayName} stepped away after ${player.walletsOpened} wallets.`,
    });
  }
}

export function fastForwardBigSpenderGame(previousState: BigSpenderState) {
  const state = cloneState(previousState);
  let guard = 0;
  while (state.status === 'running' && guard < 200) {
    guard += 1;
    const human = state.players.find((player) => player.isHuman);
    if (human && isRoundParticipant(state, human.playerId) && human.status === 'active' && human.finalizedAt == null) {
      return state;
    }

    const activePlayers = state.players.filter((player) =>
      isRoundParticipant(state, player.playerId) &&
      player.status === 'active' &&
      player.finalizedAt == null
    );

    if (activePlayers.length === 0) {
      completeIfNeeded(state);
      continue;
    }

    const playerToSimulate = isFinaleRound(state)
      ? activePlayers.find((player) => player.playerId === state.currentTurnPlayerId) ?? activePlayers[0]
      : activePlayers[0];
    if (!playerToSimulate) break;
    simulateAiPlayerToFinalized(state, playerToSimulate);
    completeIfNeeded(state);
    if ((state as BigSpenderState).status !== 'completed' && isFinaleRound(state)) advanceFinaleTurnMutable(state);
  }
  syncVisibleBoard(state);
  return state;
}

export function skipBigSpenderToResults(previousState: BigSpenderState) {
  const state = cloneState(previousState);
  let guard = 0;
  while (state.status !== 'completed' && guard < 500) {
    guard += 1;
    const human = state.players.find((player) => player.isHuman);
    if (
      human &&
      isRoundParticipant(state, human.playerId) &&
      human.status === 'active' &&
      human.finalizedAt == null
    ) {
      return state;
    }

    if (state.status === 'roundSummary') {
      continueRoundSummaryMutable(state);
      continue;
    }

    if (state.status !== 'running') break;

    const activePlayers = state.players.filter((player) =>
      isRoundParticipant(state, player.playerId) &&
      player.status === 'active' &&
      player.finalizedAt == null
    );

    if (activePlayers.length === 0) {
      completeIfNeeded(state);
      continue;
    }

    const playerToSimulate = isFinaleRound(state)
      ? activePlayers.find((player) => player.playerId === state.currentTurnPlayerId) ?? activePlayers[0]
      : activePlayers[0];
    if (!playerToSimulate) break;
    simulateAiPlayerToFinalized(state, playerToSimulate);
    completeIfNeeded(state);
    if (state.status === 'running' && isFinaleRound(state)) advanceFinaleTurnMutable(state);
  }
  syncVisibleBoard(state);
  return state;
}

export function getNextEligibleBigSpenderPlayer(state: BigSpenderState) {
  const index = nextEligibleTurnIndex(state, state.currentTurnIndex + 1);
  return index < 0 ? null : state.players.find((player) => player.playerId === state.turnOrder[index]) ?? null;
}

export function rankBigSpenderPlayers(players: BigSpenderPlayerState[]) {
  const zeroFinished = players
    .filter((player) => player.status === 'zeroFinished')
    .sort((left, right) => (left.zeroFinishedAt ?? Infinity) - (right.zeroFinishedAt ?? Infinity));

  const nonBombed = players
    .filter((player) => player.status !== 'zeroFinished' && player.status !== 'bombed')
    .sort((left, right) => {
      const balanceDelta = left.balance - right.balance;
      if (balanceDelta !== 0) return balanceDelta;
      const walletDelta = right.walletsOpened - left.walletsOpened;
      if (walletDelta !== 0) return walletDelta;
      const negativeDelta = right.negativeWalletsOpened - left.negativeWalletsOpened;
      if (negativeDelta !== 0) return negativeDelta;
      const finalDelta = (left.lockedAt ?? left.finalizedAt ?? Infinity) - (right.lockedAt ?? right.finalizedAt ?? Infinity);
      if (finalDelta !== 0) return finalDelta;
      return left.originalTurnOrderIndex - right.originalTurnOrderIndex;
    });

  const bombed = players
    .filter((player) => player.status === 'bombed')
    .sort((left, right) => {
      const bombDelta = (right.bombedAt ?? -Infinity) - (left.bombedAt ?? -Infinity);
      if (bombDelta !== 0) return bombDelta;
      return left.originalTurnOrderIndex - right.originalTurnOrderIndex;
    });

  return [...zeroFinished, ...nonBombed, ...bombed].map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}

export function rankBigSpenderGame(state: BigSpenderState) {
  if (state.players.some((player) => player.gameRank != null)) {
    return [...state.players]
      .sort((left, right) => {
        const leftRank = left.gameRank ?? Number.MAX_SAFE_INTEGER;
        const rightRank = right.gameRank ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.originalTurnOrderIndex - right.originalTurnOrderIndex;
      })
      .map((player, index) => ({ ...player, rank: player.gameRank ?? index + 1 }));
  }
  return rankBigSpenderPlayers(state.players.filter((player) => state.activePlayerIds.includes(player.playerId)));
}

export function buildBigSpenderRawResults(stateOrPlayers: BigSpenderState | BigSpenderPlayerState[]) {
  const ranked = Array.isArray(stateOrPlayers)
    ? rankBigSpenderPlayers(stateOrPlayers)
    : rankBigSpenderGame(stateOrPlayers);
  return Object.fromEntries(ranked.map((player) => [player.playerId, ranked.length - player.rank + 1]));
}
