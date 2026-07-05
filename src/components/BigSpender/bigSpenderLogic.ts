import { mulberry32 } from '../../store/rng';

export const BIG_SPENDER_GAME_ID = 'big_spender_broke_or_boom';
export const BIG_SPENDER_DISPLAY_NAME = 'Big Spender: Broke or Boom';

export const BIG_SPENDER_CONFIG = {
  startingBalance: 1000,
  boardSize: 28,
  outcomeWeights: {
    negative: 81,
    positive: 15,
    bomb: 4,
  },
  bonusExtraWalletChance: 0,
  maxExtraWalletsPerTurn: 1,
  maxAdBombRescues: 2,
} as const;

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
] as const;

const AI_POSITIVE_BROADCASTS = [
  '{name} found suspicious cashback.',
  '{name} got a wallet that fought back.',
  '{name} accidentally made things worse.',
  '{name} opened one and the room got nosy.',
] as const;

const AI_BOMB_BROADCASTS = [
  'Rumors say {name} heard a very suspicious beep.',
  'A tiny boom echoed somewhere near {name}.',
  '{name} found the wallet with commitment issues.',
  'The house just went quiet around {name}.',
] as const;

export type BigSpenderOutcomeType = 'negative' | 'positive' | 'bomb';
export type BigSpenderWalletKind = 'normal' | 'bonus' | 'secondChance';
export type BigSpenderWalletState = 'hidden' | 'opening' | 'revealed';
export type BigSpenderPlayerStatus = 'active' | 'locked' | 'zeroFinished' | 'bombed';
export type BigSpenderGameStatus = 'running' | 'completed';
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
  originalTurnOrderIndex: number;
  currentTurn: boolean;
}

export interface BigSpenderPendingBonus {
  playerId: string;
  walletId: string;
}

export interface BigSpenderPendingAdRescue {
  playerId: string;
  walletId: string;
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
    | 'playerLocked'
    | 'playerZeroFinished'
    | 'playerBombed'
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
  startingPlayerCount: number;
  turnOrder: string[];
  currentTurnIndex: number;
  currentTurnPlayerId: string | null;
  players: BigSpenderPlayerState[];
  board: BigSpenderWallet[];
  boardsByPlayerId: Record<string, BigSpenderWallet[]>;
  pendingBonus: BigSpenderPendingBonus | null;
  pendingAdRescue: BigSpenderPendingAdRescue | null;
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

function getOutcomeMessage(player: BigSpenderPlayerState, outcome: BigSpenderWalletOutcome) {
  if (outcome.type === 'bomb' && player.isHuman) return 'You opened a bomb.';
  if (outcome.type === 'bomb') return getAiBroadcastLine(player, AI_BOMB_BROADCASTS);
  const amount = outcome.amount ?? 0;
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
    events: [...state.events],
  };
}

function getPlayerMutable(state: BigSpenderState, playerId: string) {
  const player = state.players.find((entry) => entry.playerId === playerId);
  if (!player) throw new Error(`Big Spender player '${playerId}' not found.`);
  return player;
}

function getBoardMutable(state: BigSpenderState, playerId: string) {
  const board = state.boardsByPlayerId[playerId];
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
  state.board = humanPlayer ? state.boardsByPlayerId[humanPlayer.playerId] ?? [] : [];
}

function markTurnFlags(state: BigSpenderState) {
  for (const player of state.players) {
    player.currentTurn = player.playerId === state.currentTurnPlayerId;
  }
}

function nextEligibleTurnIndex(state: BigSpenderState, startIndex: number) {
  if (state.turnOrder.length === 0) return -1;
  for (let offset = 0; offset < state.turnOrder.length; offset += 1) {
    const index = (startIndex + offset) % state.turnOrder.length;
    const id = state.turnOrder[index];
    const player = state.players.find((entry) => entry.playerId === id);
    if (player && player.status === 'active' && player.finalizedAt == null) return index;
  }
  return -1;
}

function completeIfNeeded(state: BigSpenderState) {
  for (const player of state.players) {
    const hiddenWallets = (state.boardsByPlayerId[player.playerId] ?? []).some((wallet) => wallet.state === 'hidden');
    if (player.status === 'active' && player.finalizedAt == null && !hiddenWallets) {
      finalizePlayer(player, state, 'locked');
    }
  }
  const unresolved = state.players.filter((player) => player.status === 'active' && player.finalizedAt == null);
  if (unresolved.length > 0) return state;
  state.status = 'completed';
  state.currentTurnPlayerId = null;
  state.postWalletLockPlayerId = null;
  state.pendingBonus = null;
  state.pendingAdRescue = null;
  markTurnFlags(state);
  syncVisibleBoard(state);
  appendEvent(state, { type: 'gameCompleted', message: 'All players are finalized.' });
  return state;
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

function createWalletFromRoll(slotIndex: number, generationNumber: number, playerId: string, rng: () => number): BigSpenderWallet {
  const outcome = pickWalletOutcome(rng);
  return {
    walletId: `${playerId}-wallet-${slotIndex}-${generationNumber}`,
    boardSlotIndex: slotIndex,
    generationNumber,
    generationColor: generationNumber % 6,
    outcome,
    state: 'hidden',
    openedByPlayerId: null,
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
    appendEvent(state, {
      type: 'walletOpened',
      playerId: player.playerId,
      outcome,
      message: getOutcomeMessage(player, outcome),
    });
    return;
  }

  if (outcome.type === 'negative') {
    player.negativeWalletsOpened += 1;
    player.balance = clamp(player.balance + (outcome.amount ?? 0), 0, Number.MAX_SAFE_INTEGER);
    appendEvent(state, {
      type: 'walletOpened',
      playerId: player.playerId,
      outcome,
      message: getOutcomeMessage(player, outcome),
    });
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
  appendEvent(state, {
    type: 'walletOpened',
    playerId: player.playerId,
    outcome,
    message: getOutcomeMessage(player, outcome),
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
  if (state.status === 'completed' || state.pendingAdRescue || state.pendingBonus) return state;
  markTurnFlags(state);
  return state;
}

export function sumWeights(items: readonly { weight: number }[]) {
  return items.reduce((total, item) => total + item.weight, 0);
}

export function getAiActionDelayMs(_startingPlayerCount: number, rng: () => number) {
  const [min, max] = [1800, 5200];
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
  return state.boardsByPlayerId[playerId] ?? [];
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
    originalTurnOrderIndex: index,
    currentTurn: false,
  }));
  const boardsByPlayerId = Object.fromEntries(
    players.map((player) => [
      player.playerId,
      Array.from({ length: BIG_SPENDER_CONFIG.boardSize }, (_unused, slotIndex) =>
        createWalletFromRoll(slotIndex, 1, player.playerId, rng),
      ),
    ]),
  );
  const firstPlayerId = players[0]?.playerId ?? null;
  const humanPlayerId = players.find((player) => player.isHuman)?.playerId ?? firstPlayerId;
  const state: BigSpenderState = {
    gameId: BIG_SPENDER_GAME_ID,
    status: 'running',
    seed,
    randomCursor: BIG_SPENDER_CONFIG.boardSize * participants.length + participants.length,
    actionOrder: 0,
    startingPlayerCount: participants.length,
    turnOrder: players.map((player) => player.playerId),
    currentTurnIndex: 0,
    currentTurnPlayerId: firstPlayerId,
    players,
    board: humanPlayerId ? boardsByPlayerId[humanPlayerId] ?? [] : [],
    boardsByPlayerId,
    pendingBonus: null,
    pendingAdRescue: null,
    postWalletLockPlayerId: null,
    events: [],
  };
  markTurnFlags(state);
  return state;
}

export function canOfferAdRescue(state: BigSpenderState, player: BigSpenderPlayerState) {
  return (
    player.isHuman &&
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
  if (state.pendingAdRescue?.playerId === playerId || state.pendingBonus?.playerId === playerId) return state;
  const player = getPlayerMutable(state, playerId);
  if (player.status !== 'active' || player.finalizedAt != null) return state;

  const wallet = getWalletMutable(state, playerId, walletId);
  if (wallet.state !== 'hidden') return state;
  wallet.state = 'opening';
  wallet.openedByPlayerId = playerId;
  const outcome = options.forcedOutcome ?? wallet.outcome;
  wallet.outcome = outcome;
  wallet.state = 'revealed';
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
  forcedSecondChanceOutcome?: BigSpenderWalletOutcome,
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
    message: `${player.displayName} earned a second chance wallet.`,
  });
  const outcome = forcedSecondChanceOutcome ?? pickWalletOutcome(() => nextRandom(state));
  resolveSyntheticWalletMutable(state, player, outcome, 'secondChance');
  if (outcome.type === 'bomb') markBombedMutable(state, player);
  return finishAfterResolution(state);
}

export function finishBigSpenderTurn(previousState: BigSpenderState) {
  const state = cloneState(previousState);
  return advanceTurnMutable(state);
}

export function lockBigSpenderPlayer(previousState: BigSpenderState, playerId: string) {
  const state = cloneState(previousState);
  const player = getPlayerMutable(state, playerId);
  if (state.status !== 'running' || player.status !== 'active' || player.finalizedAt != null) return state;
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
  return completeIfNeeded(state);
}

export function decideAiShouldOpen(balance: number, rng: () => number) {
  const openChance = balance >= 701 ? 0.9 : balance >= 401 ? 0.75 : balance >= 151 ? 0.55 : 0.3;
  return rng() < openChance;
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

export function buildBigSpenderRawResults(players: BigSpenderPlayerState[]) {
  const ranked = rankBigSpenderPlayers(players);
  return Object.fromEntries(ranked.map((player) => [player.playerId, ranked.length - player.rank + 1]));
}
