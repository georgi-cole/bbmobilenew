import { mulberry32 } from '../../store/rng';

type BoxCategory = 'positive' | 'negative' | 'aggressive' | 'strategic' | 'chaos';
type GamePhase = 'normal' | 'final' | 'finished';
type TurnMode = 'box' | 'target' | 'martyr-blessing' | 'martyr-curse' | 'resolving' | 'finished';
type ScreenMode = 'idle' | 'vignette' | 'zoomIn' | 'flash';

type BoxType =
  | 'gain200'
  | 'shield'
  | 'doubleGain'
  | 'reveal2'
  | 'immunity'
  | 'hiddenBonus'
  | 'lose150'
  | 'loseNextTurn'
  | 'give100'
  | 'trap'
  | 'steal150'
  | 'forceOpen'
  | 'swapLp'
  | 'removeLeader200'
  | 'execution'
  | 'swapBoxes'
  | 'lockBox'
  | 'copyLastPower'
  | 'gridShuffle'
  | 'martyrdom';

interface ResolvedParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  precomputedScore: number;
  avatar: string;
}

interface GridPlayer {
  id: string;
  name: string;
  avatar: string;
  lp: number;
  isEliminated: boolean;
  shield: boolean;
  statusEffects: string[];
  doubleNextGain: boolean;
  immunityRounds: number;
  skipTurns: number;
  trapArmed: boolean;
  recentAttackerId: string | null;
  isHuman: boolean;
  support: number;
}

interface GridBox {
  id: number;
  type: BoxType;
  isOpened: boolean;
  isLocked: boolean;
  isPeeked: boolean;
}

interface PendingSelection {
  actorId: string;
  effectType: BoxType;
  sourceBoxId: number;
  chosenTargets: string[];
  step: Exclude<TurnMode, 'box' | 'resolving' | 'finished'>;
}

interface FloatingLpBurst {
  id: string;
  playerId: string;
  boxId: number;
  value: number;
  tone: 'gain' | 'loss' | 'neutral';
}

interface RevealState {
  boxId: number;
  effectType: BoxType;
}

interface GameState {
  players: GridPlayer[];
  gridBoxes: GridBox[];
  turnOrder: string[];
  currentTurnIndex: number;
  lastPowerUsed: BoxType | null;
  gamePhase: GamePhase;
  openedCount: number;
  recentEvents: string[];
  winnerId: string | null;
}

interface ResolutionOutcome {
  state: GameState;
  pendingSelection?: PendingSelection;
  message: string;
  floatingBursts: FloatingLpBurst[];
  screenMode?: ScreenMode;
  revealedEffectType?: BoxType;
}

const FALLBACK_PARTICIPANTS: ResolvedParticipant[] = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 88, avatar: '🜂' },
  { id: 'ai-1', name: 'Nyx', isHuman: false, precomputedScore: 82, avatar: '🌙' },
  { id: 'ai-2', name: 'Vex', isHuman: false, precomputedScore: 76, avatar: '⚡' },
  { id: 'ai-3', name: 'Mara', isHuman: false, precomputedScore: 71, avatar: '🕯️' },
  { id: 'ai-4', name: 'Orion', isHuman: false, precomputedScore: 64, avatar: '☄️' },
  { id: 'ai-5', name: 'Sable', isHuman: false, precomputedScore: 59, avatar: '🜃' },
];

const BOX_ORDER: BoxType[] = [
  'gain200',
  'shield',
  'doubleGain',
  'reveal2',
  'immunity',
  'hiddenBonus',
  'lose150',
  'loseNextTurn',
  'give100',
  'trap',
  'steal150',
  'forceOpen',
  'swapLp',
  'removeLeader200',
  'execution',
  'swapBoxes',
  'lockBox',
  'copyLastPower',
  'gridShuffle',
  'martyrdom',
];

const BOX_META: Record<BoxType, { label: string; symbol: string; category: BoxCategory; description: string }> = {
  gain200: { label: '+200 LP', symbol: '✦', category: 'positive', description: 'Pure life surges into your veins.' },
  shield: { label: 'Shield', symbol: '🛡', category: 'positive', description: 'Blocks the next damage or elimination.' },
  doubleGain: { label: 'Double Next Gain', symbol: '⬖', category: 'positive', description: 'Your next LP gain is doubled.' },
  reveal2: { label: 'Reveal 2', symbol: '◈', category: 'positive', description: 'Glimpse two dormant boxes.' },
  immunity: { label: 'Immunity', symbol: '☉', category: 'positive', description: 'Cannot be targeted for one round.' },
  hiddenBonus: { label: 'Hidden Bonus', symbol: '✺', category: 'positive', description: 'The chamber grants a random boon.' },
  lose150: { label: '-150 LP', symbol: '☠', category: 'negative', description: 'The chamber drinks your life.' },
  loseNextTurn: { label: 'Lose Next Turn', symbol: '⌛', category: 'negative', description: 'Your voice is silenced next round.' },
  give100: { label: 'Give 100 LP', symbol: '⇄', category: 'negative', description: 'Transfer your strength to someone else.' },
  trap: { label: 'Trap', symbol: '🜏', category: 'negative', description: 'Your next negative effect is doubled.' },
  steal150: { label: 'Steal 150 LP', symbol: '⛧', category: 'aggressive', description: 'Rip life from another player.' },
  forceOpen: { label: 'Force Open', symbol: '⫷', category: 'aggressive', description: 'Compel another player to open immediately.' },
  swapLp: { label: 'Swap LP', symbol: '⇆', category: 'aggressive', description: 'Exchange your fate with another.' },
  removeLeader200: { label: 'Drain Leader', symbol: '♛', category: 'aggressive', description: 'Remove 200 LP from the current leader.' },
  execution: { label: 'Execution', symbol: '⚚', category: 'aggressive', description: 'Instantly eliminate any eligible rival.' },
  swapBoxes: { label: 'Swap Boxes', symbol: '⌘', category: 'strategic', description: 'Rearrange two unopened relics.' },
  lockBox: { label: 'Lock Box', symbol: '⛓', category: 'strategic', description: 'Seal one box from selection.' },
  copyLastPower: { label: 'Copy Last Power', symbol: '🜁', category: 'strategic', description: 'Echo the last power used.' },
  gridShuffle: { label: 'Grid Shuffle', symbol: '☄', category: 'chaos', description: 'Unopened powers spin through the chamber.' },
  martyrdom: { label: 'Martyrdom', symbol: '✠', category: 'chaos', description: 'Fall, bless one, and curse another — or the same rival in a duel.' },
};

const CATEGORY_COLORS: Record<BoxCategory, string> = {
  positive: '#4cf4dd',
  negative: '#8a53ff',
  aggressive: '#ff4b5e',
  strategic: '#f3c269',
  chaos: '#f2f5ff',
};

const ELIMINATION_TYPES = new Set<BoxType>(['execution', 'martyrdom']);
const HUMAN_PICK_DELAY_MS = 1200;
const MAX_CHAIN_DEPTH = 4;
const MAX_GRID_OF_LUCK_PLAYERS = 10;
const MARTYRDOM_ELIMINATION_DAMAGE = 10_000;
function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function appendEvent(recentEvents: string[], message: string): string[] {
  return [message, ...recentEvents].slice(0, 7);
}

function withStatusEffects(player: GridPlayer): GridPlayer {
  const statusEffects: string[] = [];
  if (player.shield) statusEffects.push('Shielded');
  if (player.doubleNextGain) statusEffects.push('Double gain');
  if (player.immunityRounds > 0) statusEffects.push('Immune');
  if (player.skipTurns > 0) statusEffects.push('Turn lost');
  if (player.trapArmed) statusEffects.push('Trap primed');
  return { ...player, statusEffects };
}

function clonePlayers(players: GridPlayer[]): GridPlayer[] {
  return players.map((player) => withStatusEffects({ ...player, statusEffects: [...player.statusEffects] }));
}

function cloneBoxes(boxes: GridBox[]): GridBox[] {
  return boxes.map((box) => ({ ...box }));
}

function buildPlayers(participants: ResolvedParticipant[]): GridPlayer[] {
  return participants.map((participant) => withStatusEffects({
    id: participant.id,
    name: participant.name,
    avatar: participant.avatar,
    lp: 500,
    isEliminated: false,
    shield: false,
    statusEffects: [],
    doubleNextGain: false,
    immunityRounds: 0,
    skipTurns: 0,
    trapArmed: false,
    recentAttackerId: null,
    isHuman: participant.isHuman,
    support: participant.precomputedScore,
  }));
}

function buildBoxes(seed: number): GridBox[] {
  const rng = mulberry32(seed >>> 0);
  return shuffleWithRng(BOX_ORDER, rng).map((type, index) => ({
    id: index,
    type,
    isOpened: false,
    isLocked: false,
    isPeeked: false,
  }));
}

function createInitialState(participants: ResolvedParticipant[], seed: number): GameState {
  const players = buildPlayers(participants).sort((left, right) => right.support - left.support);
  return {
    players,
    gridBoxes: buildBoxes(seed),
    turnOrder: players.map((player) => player.id),
    currentTurnIndex: 0,
    lastPowerUsed: null,
    gamePhase: 'normal',
    openedCount: 0,
    recentEvents: ['The chamber awakens.'],
    winnerId: null,
  };
}

function getPlayer(players: GridPlayer[], playerId: string): GridPlayer {
  const player = players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error(`Grid of Luck player '${playerId}' not found.`);
  }
  return player;
}

function getCurrentPlayer(state: GameState): GridPlayer {
  return getPlayer(state.players, state.turnOrder[state.currentTurnIndex] ?? state.turnOrder[0]);
}

function getAlivePlayers(players: GridPlayer[]): GridPlayer[] {
  return players.filter((player) => !player.isEliminated);
}

function getOpenableBoxes(boxes: GridBox[]): GridBox[] {
  return boxes.filter((box) => !box.isOpened && !box.isLocked);
}

function getValidTargets(players: GridPlayer[], actorId: string, effectType: BoxType): GridPlayer[] {
  const actor = getPlayer(players, actorId);
  const aliveOthers = players.filter((player) => !player.isEliminated && player.id !== actorId && player.immunityRounds <= 0);
  if (effectType === 'removeLeader200') {
    const leader = [...getAlivePlayers(players)].sort((left, right) => {
      if (right.lp !== left.lp) return right.lp - left.lp;
      return right.support - left.support;
    })[0];
    return leader && (leader.id === actor.id || leader.immunityRounds <= 0) ? [leader] : [];
  }
  return aliveOthers;
}

function chooseAiBox(state: GameState, actorId: string, rng: () => number): GridBox {
  const actor = getPlayer(state.players, actorId);
  const openable = getOpenableBoxes(state.gridBoxes);
  const peeked = openable.filter((box) => box.isPeeked);
  if (peeked.length > 0 && rng() > 0.34) {
    return pickRandom(rng, peeked);
  }
  const aliveSorted = getAlivePlayers(state.players).sort((left, right) => right.lp - left.lp);
  const actorRank = aliveSorted.findIndex((player) => player.id === actor.id);
  const biasThreshold = actorRank <= 1 ? 0.35 : actorRank >= aliveSorted.length - 2 ? 0.75 : 0.55;
  if (rng() > biasThreshold) {
    return openable[Math.floor(rng() * openable.length)];
  }
  const weighted = [...openable].sort((left, right) => {
    const leftMeta = BOX_META[left.type];
    const rightMeta = BOX_META[right.type];
    const actorUnderPressure = actor.lp <= 300;
    const leftScore = (left.isPeeked ? 2 : 0)
      + (leftMeta.category === 'positive' && actorUnderPressure ? 1 : 0)
      + (leftMeta.category === 'chaos' && actorRank >= aliveSorted.length - 2 ? 1 : 0);
    const rightScore = (right.isPeeked ? 2 : 0)
      + (rightMeta.category === 'positive' && actorUnderPressure ? 1 : 0)
      + (rightMeta.category === 'chaos' && actorRank >= aliveSorted.length - 2 ? 1 : 0);
    return rightScore - leftScore;
  });
  return weighted[0] ?? openable[0];
}

function chooseAiTarget(players: GridPlayer[], actorId: string, effectType: BoxType, rng: () => number, excludedIds: string[] = []): GridPlayer | null {
  const actor = getPlayer(players, actorId);
  const aliveSorted = [...getAlivePlayers(players)].sort((left, right) => {
    if (right.lp !== left.lp) return right.lp - left.lp;
    return right.support - left.support;
  });
  const actorRank = aliveSorted.findIndex((player) => player.id === actorId);
  const valid = getValidTargets(players, actorId, effectType).filter((player) => !excludedIds.includes(player.id));
  if (valid.length === 0) return null;
  const leaderStyle = actorRank === 0;
  const lowLpStyle = actorRank >= aliveSorted.length - 2 || actor.lp <= 240;
  const revengeTarget = valid.find((player) => player.id === actor.recentAttackerId);
  if (revengeTarget && rng() > 0.18) return revengeTarget;
  const ranked = [...valid].sort((left, right) => {
    const threatGap = right.lp - left.lp;
    const defensiveBias = Math.abs((left.lp - actor.lp)) - Math.abs((right.lp - actor.lp));
    return leaderStyle ? defensiveBias || threatGap : threatGap;
  });
  const randomness = 0.15 + rng() * 0.1;
  if (rng() < randomness) {
    return pickRandom(rng, valid);
  }
  if (lowLpStyle) {
    return ranked[0] ?? valid[0];
  }
  return leaderStyle ? ranked[ranked.length - 1] ?? valid[0] : ranked[0] ?? valid[0];
}

function determineGamePhase(players: GridPlayer[], boxes: GridBox[]): GamePhase {
  const alive = getAlivePlayers(players);
  const remaining = boxes.filter((box) => !box.isOpened).length;
  if (alive.length <= 1 || remaining <= 0) return 'finished';
  if (alive.length <= 3 || remaining <= 2) return 'final';
  return 'normal';
}

function finalizeState(state: GameState, message: string): GameState {
  const players = clonePlayers(state.players).sort((left, right) => {
    if (right.lp !== left.lp) return right.lp - left.lp;
    return right.support - left.support;
  });
  const gridBoxes = cloneBoxes(state.gridBoxes);
  const unopenedLocked = gridBoxes.filter((box) => !box.isOpened && box.isLocked);
  const unopened = gridBoxes.filter((box) => !box.isOpened);
  if (unopened.length > 0 && unopenedLocked.length === unopened.length) {
    unopenedLocked.forEach((box) => {
      box.isLocked = false;
    });
  }
  const gamePhase = determineGamePhase(players, gridBoxes);
  const winnerId = gamePhase === 'finished' ? players.find((player) => !player.isEliminated)?.id ?? players[0]?.id ?? null : null;
  return {
    ...state,
    players,
    gridBoxes,
    gamePhase,
    recentEvents: appendEvent(state.recentEvents, message),
    winnerId,
  };
}

function addBurst(floatingBursts: FloatingLpBurst[], playerId: string, boxId: number, value: number): FloatingLpBurst[] {
  if (!value) return floatingBursts;
  return [
    ...floatingBursts,
    {
      id: `${playerId}-${boxId}-${floatingBursts.length}-${Math.abs(value)}`,
      playerId,
      boxId,
      value,
      tone: value > 0 ? 'gain' : value < 0 ? 'loss' : 'neutral',
    },
  ];
}

function applyGain(players: GridPlayer[], playerId: string, amount: number): { players: GridPlayer[]; applied: number } {
  const nextPlayers = clonePlayers(players);
  const player = getPlayer(nextPlayers, playerId);
  const multiplier = player.doubleNextGain ? 2 : 1;
  const applied = amount * multiplier;
  player.lp += applied;
  player.doubleNextGain = false;
  return { players: nextPlayers.map(withStatusEffects), applied };
}

function applyLossValue(players: GridPlayer[], playerId: string, amount: number, unopenedAfterReveal: number): { players: GridPlayer[]; applied: number; blocked: boolean; spared: boolean } {
  const nextPlayers = clonePlayers(players);
  const player = getPlayer(nextPlayers, playerId);
  let appliedAmount = amount;
  if (player.trapArmed) {
    appliedAmount *= 2;
    player.trapArmed = false;
  }
  if (player.shield) {
    player.shield = false;
    return { players: nextPlayers.map(withStatusEffects), applied: 0, blocked: true, spared: false };
  }
  const aliveCount = getAlivePlayers(nextPlayers).length;
  const wouldEliminate = player.lp - appliedAmount <= 0;
  if (wouldEliminate && unopenedAfterReveal > 2 && aliveCount <= 3) {
    player.lp = Math.max(1, player.lp);
    return { players: nextPlayers.map(withStatusEffects), applied: 0, blocked: false, spared: true };
  }
  player.lp -= appliedAmount;
  if (player.lp <= 0) {
    player.lp = 0;
    player.isEliminated = true;
  }
  return { players: nextPlayers.map(withStatusEffects), applied: appliedAmount, blocked: false, spared: false };
}

function applyTransferLoss(players: GridPlayer[], playerId: string, amount: number, unopenedAfterReveal: number): { players: GridPlayer[]; applied: number; spared: boolean } {
  const nextPlayers = clonePlayers(players);
  const player = getPlayer(nextPlayers, playerId);
  let appliedAmount = amount;
  if (player.trapArmed) {
    appliedAmount *= 2;
    player.trapArmed = false;
  }
  const aliveCount = getAlivePlayers(nextPlayers).length;
  const wouldEliminate = player.lp - appliedAmount <= 0;
  if (wouldEliminate && unopenedAfterReveal > 2 && aliveCount <= 3) {
    player.lp = Math.max(1, player.lp);
    return { players: nextPlayers.map(withStatusEffects), applied: 0, spared: true };
  }
  player.lp -= appliedAmount;
  if (player.lp <= 0) {
    player.lp = 0;
    player.isEliminated = true;
  }
  return { players: nextPlayers.map(withStatusEffects), applied: appliedAmount, spared: false };
}

function applySkip(players: GridPlayer[], playerId: string): { players: GridPlayer[]; applied: number } {
  const nextPlayers = clonePlayers(players);
  const player = getPlayer(nextPlayers, playerId);
  const applied = player.trapArmed ? 2 : 1;
  player.trapArmed = false;
  player.skipTurns += applied;
  return { players: nextPlayers.map(withStatusEffects), applied };
}

function swapBoxTypes(boxes: GridBox[], firstId: number, secondId: number): GridBox[] {
  const nextBoxes = cloneBoxes(boxes);
  const first = nextBoxes.find((box) => box.id === firstId);
  const second = nextBoxes.find((box) => box.id === secondId);
  if (!first || !second) return nextBoxes;
  [first.type, second.type] = [second.type, first.type];
  first.isPeeked = false;
  second.isPeeked = false;
  return nextBoxes;
}

function pickSafeTypeForEarlyTurn(boxes: GridBox[], boxId: number): { boxes: GridBox[]; effectType: BoxType } {
  const currentBox = boxes.find((box) => box.id === boxId);
  if (!currentBox) return { boxes, effectType: 'hiddenBonus' };
  if (!ELIMINATION_TYPES.has(currentBox.type)) {
    return { boxes, effectType: currentBox.type };
  }
  const replacement = boxes.find((box) => !box.isOpened && box.id !== boxId && !ELIMINATION_TYPES.has(box.type));
  if (!replacement) {
    return { boxes, effectType: 'hiddenBonus' };
  }
  return {
    boxes: swapBoxTypes(boxes, boxId, replacement.id),
    effectType: replacement.type,
  };
}

function advanceTurn(state: GameState): { state: GameState; message: string } {
  let players = clonePlayers(state.players);
  let nextIndex = state.currentTurnIndex;
  let wrapped = false;
  let skippedPlayerName = '';

  for (let attempt = 0; attempt < state.turnOrder.length; attempt += 1) {
    nextIndex = (nextIndex + 1) % state.turnOrder.length;
    if (nextIndex === 0) {
      wrapped = true;
    }
    const candidate = getPlayer(players, state.turnOrder[nextIndex]);
    if (candidate.isEliminated) continue;
    if (candidate.skipTurns > 0) {
      candidate.skipTurns -= 1;
      skippedPlayerName = candidate.name;
      players = players.map(withStatusEffects);
      continue;
    }
    break;
  }

  if (wrapped) {
    players = players.map((player) => withStatusEffects({
      ...player,
      immunityRounds: Math.max(0, player.immunityRounds - 1),
    }));
  }

  const active = getPlayer(players, state.turnOrder[nextIndex]);
  const message = skippedPlayerName
    ? `${skippedPlayerName} loses their turn. ${active.name} steps into the spotlight.`
    : `${active.name} steps into the spotlight.`;

  return {
    state: finalizeState({ ...state, players, currentTurnIndex: nextIndex }, message),
    message,
  };
}

function getNextEligiblePlayer(state: GameState): GridPlayer | null {
  if (state.gamePhase === 'finished') return null;

  const order = state.turnOrder;
  if (order.length === 0) return null;

  const playersById = new Map(state.players.map((player) => [player.id, player]));
  const simulatedSkipTurns = new Map(
    state.players.map((player) => [player.id, Math.max(0, player.skipTurns ?? 0)]),
  );
  const totalSkips = Array.from(simulatedSkipTurns.values()).reduce((sum, turns) => sum + turns, 0);
  const maxChecks = order.length + totalSkips;

  for (let i = 1; i <= maxChecks; i += 1) {
    const idx = (state.currentTurnIndex + i) % order.length;
    const candidate = playersById.get(order[idx]);

    if (!candidate || candidate.isEliminated) continue;

    const remainingSkips = simulatedSkipTurns.get(candidate.id) ?? 0;
    if (remainingSkips > 0) {
      simulatedSkipTurns.set(candidate.id, remainingSkips - 1);
      continue;
    }

    return candidate;
  }

  return null;
}

function resolveAutoTargetIds(players: GridPlayer[], actorId: string, effectType: BoxType, rng: () => number): string[] {
  if (effectType === 'martyrdom') {
    const blessing = chooseAiTarget(players, actorId, 'steal150', rng);
    const curse = chooseAiTarget(players, actorId, 'steal150', rng, blessing ? [blessing.id] : []);
    return [blessing?.id, curse?.id].filter((value): value is string => Boolean(value));
  }
  const target = chooseAiTarget(players, actorId, effectType, rng);
  return target ? [target.id] : [];
}

function resolveForcedOpen(state: GameState, targetId: string, rng: () => number, chainDepth: number): { state: GameState; message: string; floatingBursts: FloatingLpBurst[] } {
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    return { state, message: 'The chamber refuses to spiral any further.', floatingBursts: [] };
  }
  const openable = getOpenableBoxes(state.gridBoxes);
  if (openable.length === 0) {
    return { state, message: 'No unopened boxes remain — the force fizzles out.', floatingBursts: [] };
  }
  const chosenBox = chooseAiBox(state, targetId, rng);
  const selection = resolveBoxSelection(state, targetId, chosenBox.id, rng, chainDepth + 1, true);
  if (selection.pendingSelection) {
    const targetIds = resolveAutoTargetIds(selection.state.players, selection.pendingSelection.actorId, selection.pendingSelection.effectType, rng);
    return applyEffectSelection(
      selection.state,
      selection.pendingSelection.actorId,
      selection.pendingSelection.effectType,
      selection.pendingSelection.sourceBoxId,
      targetIds,
      rng,
      chainDepth + 1,
      true,
    );
  }
  return {
    state: selection.state,
    message: selection.message,
    floatingBursts: selection.floatingBursts,
  };
}

function applyEffectSelection(
  state: GameState,
  actorId: string,
  effectType: BoxType,
  sourceBoxId: number,
  targetIds: string[],
  rng: () => number,
  chainDepth = 0,
  fromForcedOpen = false,
): ResolutionOutcome {
  let nextState: GameState = {
    ...state,
    players: clonePlayers(state.players),
    gridBoxes: cloneBoxes(state.gridBoxes),
    lastPowerUsed: effectType,
  };
  let message = '';
  let floatingBursts: FloatingLpBurst[] = [];
  const actor = getPlayer(nextState.players, actorId);
  const unopenedAfterReveal = nextState.gridBoxes.filter((box) => !box.isOpened).length;

  const targetId = targetIds[0] ?? null;
  const secondTargetId = targetIds[1] ?? null;

  switch (effectType) {
    case 'gain200': {
      const gain = applyGain(nextState.players, actorId, 200);
      nextState.players = gain.players;
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, gain.applied);
      message = `${actor.name} claims +${gain.applied} LP.`;
      break;
    }
    case 'shield': {
      getPlayer(nextState.players, actorId).shield = true;
      nextState.players = nextState.players.map(withStatusEffects);
      message = `${actor.name} is wrapped in a ritual shield.`;
      break;
    }
    case 'doubleGain': {
      getPlayer(nextState.players, actorId).doubleNextGain = true;
      nextState.players = nextState.players.map(withStatusEffects);
      message = `${actor.name}'s next LP gain will be doubled.`;
      break;
    }
    case 'reveal2': {
      const revealTargets = shuffleWithRng(getOpenableBoxes(nextState.gridBoxes), rng).slice(0, 2);
      revealTargets.forEach((box) => {
        const targetBox = nextState.gridBoxes.find((entry) => entry.id === box.id);
        if (targetBox) targetBox.isPeeked = true;
      });
      message = revealTargets.length > 0
        ? `${actor.name} peeks at ${revealTargets.map((box) => BOX_META[box.type].label).join(' and ')}.`
        : `${actor.name} reaches for visions, but the chamber offers none.`;
      break;
    }
    case 'immunity': {
      getPlayer(nextState.players, actorId).immunityRounds = 1;
      nextState.players = nextState.players.map(withStatusEffects);
      message = `${actor.name} cannot be targeted until the next round turns.`;
      break;
    }
    case 'hiddenBonus': {
      const amount = 50 + Math.floor(rng() * 101);
      const gain = applyGain(nextState.players, actorId, amount);
      nextState.players = gain.players;
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, gain.applied);
      message = `${actor.name} uncovers a hidden bonus worth +${gain.applied} LP.`;
      break;
    }
    case 'lose150': {
      const loss = applyLossValue(nextState.players, actorId, 150, unopenedAfterReveal);
      nextState.players = loss.players;
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, -loss.applied);
      message = loss.blocked
        ? `${actor.name}'s shield devours the curse.`
        : loss.spared
          ? `${actor.name} should have fallen, but the chamber spares them for now.`
          : `${actor.name} loses ${loss.applied} LP.`;
      break;
    }
    case 'loseNextTurn': {
      const skip = applySkip(nextState.players, actorId);
      nextState.players = skip.players;
      message = `${actor.name} will lose ${skip.applied > 1 ? `${skip.applied} turns` : 'their next turn'}.`;
      break;
    }
    case 'give100': {
      if (!targetId) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const transfer = applyTransferLoss(nextState.players, actorId, 100, unopenedAfterReveal);
      nextState.players = transfer.players;
      if (transfer.applied > 0) {
        const gain = applyGain(nextState.players, targetId, transfer.applied);
        nextState.players = gain.players;
        floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, -transfer.applied);
        floatingBursts = addBurst(floatingBursts, targetId, sourceBoxId, transfer.applied);
      }
      message = transfer.spared
        ? `${actor.name} almost gives away everything, but the chamber keeps them alive for the final turns.`
        : `${actor.name} grants ${transfer.applied} LP to ${getPlayer(nextState.players, targetId).name}.`;
      break;
    }
    case 'trap': {
      getPlayer(nextState.players, actorId).trapArmed = true;
      nextState.players = nextState.players.map(withStatusEffects);
      message = `${actor.name} is marked — the next negative effect will be doubled.`;
      break;
    }
    case 'steal150': {
      if (!targetId) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const victim = getPlayer(nextState.players, targetId);
      const loss = applyLossValue(nextState.players, targetId, 150, unopenedAfterReveal);
      nextState.players = loss.players;
      if (loss.applied > 0) {
        const gain = applyGain(nextState.players, actorId, loss.applied);
        nextState.players = gain.players;
      }
      getPlayer(nextState.players, targetId).recentAttackerId = actorId;
      floatingBursts = addBurst(floatingBursts, targetId, sourceBoxId, -loss.applied);
      floatingBursts = addBurst(floatingBursts, actorId, sourceBoxId, loss.applied);
      message = loss.blocked
        ? `${victim.name}'s shield denies ${actor.name} the theft.`
        : loss.spared
          ? `${victim.name} clings to 1 LP as ${actor.name}'s theft almost ends them.`
          : `${actor.name} steals ${loss.applied} LP from ${victim.name}.`;
      break;
    }
    case 'forceOpen': {
      if (!targetId) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const forced = resolveForcedOpen(nextState, targetId, rng, chainDepth + 1);
      nextState = forced.state;
      message = `${actor.name} compels ${getPlayer(nextState.players, targetId).name} to open a box. ${forced.message}`;
      floatingBursts = [...floatingBursts, ...forced.floatingBursts];
      break;
    }
    case 'swapLp': {
      if (!targetId) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const self = getPlayer(nextState.players, actorId);
      const target = getPlayer(nextState.players, targetId);
      [self.lp, target.lp] = [target.lp, self.lp];
      message = `${self.name} swaps LP totals with ${target.name}.`;
      break;
    }
    case 'removeLeader200': {
      const target = chooseAiTarget(nextState.players, actorId, 'removeLeader200', rng);
      if (!target) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const loss = applyLossValue(nextState.players, target.id, 200, unopenedAfterReveal);
      nextState.players = loss.players;
      floatingBursts = addBurst(floatingBursts, target.id, sourceBoxId, -loss.applied);
      getPlayer(nextState.players, target.id).recentAttackerId = actorId;
      message = loss.blocked
        ? `${target.name}'s shield defies the leader drain.`
        : `${target.name}, the leader, loses ${loss.applied} LP.`;
      break;
    }
    case 'execution': {
      if (!targetId) {
        return applyEffectSelection(nextState, actorId, 'hiddenBonus', sourceBoxId, [], rng, chainDepth + 1, fromForcedOpen);
      }
      const target = getPlayer(nextState.players, targetId);
      if (target.shield) {
        target.shield = false;
        nextState.players = nextState.players.map(withStatusEffects);
        message = `${target.name}'s shield blocks execution.`;
        break;
      }
      if (unopenedAfterReveal > 2 && getAlivePlayers(nextState.players).length <= 3) {
        target.lp = Math.max(target.lp, 1);
        nextState.players = nextState.players.map(withStatusEffects);
        message = `${target.name} is dragged to the brink, but the chamber delays death until the final turns.`;
        break;
      }
      target.lp = 0;
      target.isEliminated = true;
      nextState.players = nextState.players.map(withStatusEffects);
      message = `${actor.name} executes ${target.name} instantly.`;
      break;
    }
    case 'swapBoxes': {
      const unopened = shuffleWithRng(nextState.gridBoxes.filter((box) => !box.isOpened), rng);
      if (unopened.length >= 2) {
        nextState.gridBoxes = swapBoxTypes(nextState.gridBoxes, unopened[0].id, unopened[1].id);
        message = `${actor.name} swaps two dormant boxes in the shadows.`;
      } else {
        message = `${actor.name} tries to shift the grid, but there are not enough unopened boxes.`;
      }
      break;
    }
    case 'lockBox': {
      const candidates = nextState.gridBoxes.filter((box) => !box.isOpened && !box.isLocked);
      const chosen = candidates.length > 0 ? pickRandom(rng, candidates) : null;
      if (chosen) {
        const target = nextState.gridBoxes.find((box) => box.id === chosen.id);
        if (target) target.isLocked = true;
        message = `${actor.name} seals one box shut.`;
      } else {
        message = `${actor.name} reaches for a lock, but every box is already marked.`;
      }
      break;
    }
    case 'copyLastPower': {
      const copied = nextState.lastPowerUsed && nextState.lastPowerUsed !== 'copyLastPower'
        ? nextState.lastPowerUsed
        : 'hiddenBonus';
      const copiedTargets = resolveAutoTargetIds(nextState.players, actorId, copied, rng);
      const copiedResolution = applyEffectSelection(nextState, actorId, copied, sourceBoxId, copiedTargets, rng, chainDepth + 1, fromForcedOpen);
      copiedResolution.state.lastPowerUsed = copied;
      return {
        ...copiedResolution,
        message: `${actor.name} echoes ${BOX_META[copied].label}. ${copiedResolution.message}`,
        revealedEffectType: copied,
      };
    }
    case 'gridShuffle': {
      const unopened = nextState.gridBoxes.filter((box) => !box.isOpened);
      const shuffledTypes = shuffleWithRng(unopened.map((box) => box.type), rng);
      unopened.forEach((box, index) => {
        const target = nextState.gridBoxes.find((entry) => entry.id === box.id);
        if (target) {
          target.type = shuffledTypes[index] ?? target.type;
          target.isPeeked = false;
        }
      });
      message = `${actor.name} triggers a grid shuffle.`;
      break;
    }
    case 'martyrdom': {
      const blessingId = targetId;
      const curseId = secondTargetId ?? blessingId;
      const sacrifice = applyLossValue(nextState.players, actorId, MARTYRDOM_ELIMINATION_DAMAGE, unopenedAfterReveal);
      nextState.players = sacrifice.players;
      if (blessingId) {
        const blessing = applyGain(nextState.players, blessingId, 300);
        nextState.players = blessing.players;
        floatingBursts = addBurst(floatingBursts, blessingId, sourceBoxId, blessing.applied);
      }
      if (curseId) {
        const curse = applyLossValue(nextState.players, curseId, 200, unopenedAfterReveal);
        nextState.players = curse.players;
        floatingBursts = addBurst(floatingBursts, curseId, sourceBoxId, -curse.applied);
      }
      const affectsSingleRival = blessingId !== undefined && blessingId === curseId;
      message = sacrifice.spared
        ? `${actor.name} offers martyrdom, but the chamber refuses the death before the endgame.`
        : affectsSingleRival
          ? `${actor.name} embraces martyrdom and twists the fate of a lone rival.`
          : `${actor.name} embraces martyrdom and twists the fate of two rivals.`;
      break;
    }
  }

  nextState = finalizeState(nextState, message);
  return {
    state: nextState,
    message,
    floatingBursts,
    screenMode: effectType === 'gridShuffle' || effectType === 'martyrdom' ? 'flash' : 'vignette',
    revealedEffectType: effectType,
  };
}

function resolveBoxSelection(
  state: GameState,
  actorId: string,
  boxId: number,
  rng: () => number,
  chainDepth = 0,
  fromForcedOpen = false,
): ResolutionOutcome {
  const box = state.gridBoxes.find((entry) => entry.id === boxId);
  if (!box || box.isOpened || box.isLocked) {
    return { state, message: 'That box cannot be opened.', floatingBursts: [] };
  }

  const nextState: GameState = {
    ...state,
    players: clonePlayers(state.players),
    gridBoxes: cloneBoxes(state.gridBoxes),
  };
  let effectType = box.type;

  if (nextState.openedCount < 3 && ELIMINATION_TYPES.has(effectType)) {
    const safePick = pickSafeTypeForEarlyTurn(nextState.gridBoxes, boxId);
    nextState.gridBoxes = safePick.boxes;
    effectType = safePick.effectType;
  }

  const targetBox = nextState.gridBoxes.find((entry) => entry.id === boxId);
  if (!targetBox) {
    return { state, message: 'The chosen box vanishes before it can open.', floatingBursts: [] };
  }

  targetBox.isOpened = true;
  targetBox.isLocked = false;
  targetBox.isPeeked = false;
  nextState.openedCount += 1;

  const requiresTarget = ['give100', 'steal150', 'forceOpen', 'swapLp', 'execution'].includes(effectType)
    || effectType === 'martyrdom';
  if (requiresTarget && !fromForcedOpen) {
    const validTargets = getValidTargets(nextState.players, actorId, effectType);
    if (effectType === 'martyrdom' && validTargets.length >= 2 && getPlayer(nextState.players, actorId).isHuman) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'martyr-blessing',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose who is blessed by martyrdom.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      };
    }
    if (effectType === 'martyrdom' && validTargets.length === 1 && getPlayer(nextState.players, actorId).isHuman) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'target',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose the rival touched by martyrdom.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      };
    }
    if (validTargets.length >= 1 && getPlayer(nextState.players, actorId).isHuman) {
      return {
        state: nextState,
        pendingSelection: {
          actorId,
          effectType,
          sourceBoxId: boxId,
          chosenTargets: [],
          step: 'target',
        },
        message: `${getPlayer(nextState.players, actorId).name} must choose a target for ${BOX_META[effectType].label}.`,
        floatingBursts: [],
        screenMode: 'zoomIn',
        revealedEffectType: effectType,
      };
    }
  }

  const targetIds = requiresTarget ? resolveAutoTargetIds(nextState.players, actorId, effectType, rng) : [];
  return applyEffectSelection(nextState, actorId, effectType, boxId, targetIds, rng, chainDepth + 1, fromForcedOpen);
}

export type {
  BoxCategory,
  GamePhase,
  TurnMode,
  ScreenMode,
  BoxType,
  ResolvedParticipant,
  GridPlayer,
  GridBox,
  PendingSelection,
  FloatingLpBurst,
  RevealState,
  GameState,
  ResolutionOutcome,
};

export {
  BOX_META,
  CATEGORY_COLORS,
  ELIMINATION_TYPES,
  HUMAN_PICK_DELAY_MS,
  MAX_CHAIN_DEPTH,
  MAX_GRID_OF_LUCK_PLAYERS,
  MARTYRDOM_ELIMINATION_DAMAGE,
  FALLBACK_PARTICIPANTS,
  BOX_ORDER,
  createInitialState,
  getPlayer,
  getCurrentPlayer,
  getAlivePlayers,
  getOpenableBoxes,
  getValidTargets,
  chooseAiBox,
  chooseAiTarget,
  advanceTurn,
  getNextEligiblePlayer,
  resolveAutoTargetIds,
  resolveBoxSelection,
  applyEffectSelection,
};
