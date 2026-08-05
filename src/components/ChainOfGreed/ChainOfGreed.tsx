import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import {
  applyRoundReset,
  buildAiVoteRecords,
  buildFinalRawResults,
  CHAIN_TURN_PIPELINE_DURATIONS,
  CHAIN_LADDER,
  type ChainActionResolution,
  createChainOfGreedPlayers,
  createChainOfGreedRng,
  createInitialChainState,
  decideAiAction,
  FINAL_ROUND_DURATION_MS,
  formatInfluence,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
  rankFinalPlayersByScore,
  rankPlayersByScore,
  resolveChainAction,
  resolveChainOfGreedParticipants,
  resolveVoteElimination,
  SEMIFINAL_TURNS_PER_PLAYER,
  summarizeRound,
  type ChainAction,
  type ChainOfGreedChainState,
  type ChainOfGreedPlayerState,
  type ChainOfGreedTieBreakInfo,
  type ChainOfGreedTurnRecord,
  type ChainOfGreedVoteRecord,
} from './chainOfGreedLogic';
import './ChainOfGreed.css';

type Phase =
  | 'intro'
  | 'rules'
  | 'roundIntro'
  | 'playerTurn'
  | 'roundSummary'
  | 'voting'
  | 'voteReveal'
  | 'eliminationReveal'
  | 'semifinalIntro'
  | 'semifinalTurn'
  | 'semifinalReveal'
  | 'finalIntro'
  | 'finalTurn'
  | 'finalResult';

type TurnPhaseKind = 'standard' | 'semifinal' | 'final';
type TurnPipelineStage = 'decision' | 'reveal' | 'verdict' | 'consequence' | 'ladderUpdate' | 'settle';

interface ChainOfGreedState {
  phase: Phase;
  players: ChainOfGreedPlayerState[];
  startingCount: number;
  roundNumber: number;
  securedTotal: number;
  roundSecured: number;
  chain: ChainOfGreedChainState;
  turnOrder: string[];
  turnIndex: number;
  turnsRemaining: number;
  statusText: string;
  helperText: string;
  turnHistory: ChainOfGreedTurnRecord[];
  showHelp: boolean;
  revealedNumber: number | null;
  humanVoteTargetId: string | null;
  pendingVotes: ChainOfGreedVoteRecord[];
  revealedVotes: number;
  tieBreaks: ChainOfGreedTieBreakInfo[];
  eliminatedThisStep: string[];
  semifinalOrder: string[];
  semifinalTurnIndex: number;
  semifinalScores: Record<string, number>;
  semifinalChains: Record<string, ChainOfGreedChainState>;
  semifinalTieBreak: ChainOfGreedTieBreakInfo | null;
  semifinalEliminatedId: string | null;
  finalOrder: string[];
  finalTurnIndex: number;
  finalScores: Record<string, number>;
  finalChains: Record<string, ChainOfGreedChainState>;
  finalTieBreak: ChainOfGreedTieBreakInfo | null;
  winnerId: string | null;
  spectatorMode: 'watching' | 'skipping' | null;
  finalTimerExpiry: number | null;
  finalTimerPausedRemaining: number | null;
}

interface PendingTurnPipeline {
  actorId: string;
  actorName: string;
  kind: TurnPhaseKind;
  choice: ChainAction;
  stage: TurnPipelineStage;
  referenceNumber: number;
  resolution: ChainActionResolution;
  historyEntry: ChainOfGreedTurnRecord;
  verdictText: string;
  consequenceText: string;
  tone: 'neutral' | 'success' | 'bank' | 'danger';
  turnEnds: boolean;
  turnsRemainingBefore?: number;
  turnIndexBefore?: number;
  orderLength?: number;
  chainBefore: ChainOfGreedChainState;
}

const TURN_HELPERS = [
  'Build the chain or bank it.',
  'A wrong guess destroys the active pot.',
  'Equal numbers count as a miss.',
  'Banking saves the pot, but resets momentum.',
  'The higher the chain, the more painful the risk.',
];

const FINAL_HELPERS = [
  'No more sympathy. Only performance.',
  'The chain is personal now.',
  'One winner takes the entire influence pool.',
];

const momentGlyphs: Record<Exclude<ChainOfGreedPlayerState['latestMoment'], null>, string> = {
  safe: '•',
  higher: '↑',
  lower: '↓',
  wrong: '✕',
  bank: '💰',
  bust: '✖',
};
const TURN_PIPELINE_STAGE_ORDER: Record<Exclude<TurnPipelineStage, 'settle'>, TurnPipelineStage> = {
  decision: 'reveal',
  reveal: 'verdict',
  verdict: 'consequence',
  consequence: 'ladderUpdate',
  ladderUpdate: 'settle',
};

const FAST_AI_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 150,
  reveal: 220,
  verdict: 220,
  consequence: 220,
  ladderUpdate: 180,
  settle: 150,
};

const FAST_FINAL_BANK_PIPELINE_DURATIONS: Record<TurnPipelineStage, number> = {
  decision: 120,
  reveal: 130,
  verdict: 130,
  consequence: 160,
  ladderUpdate: 120,
  settle: 120,
};

const STANDARD_ROUND_COUNT = 5;
const ROUND_INTRO_DURATION_MS = 5_000;

function emitSoundCue(cue: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('bb:minigame-sound', {
    detail: { source: 'ChainOfGreed', cue },
  }));
}

function rotateOrder(ids: string[], offset: number) {
  if (ids.length === 0) return ids;
  const safeOffset = ((offset % ids.length) + ids.length) % ids.length;
  return [...ids.slice(safeOffset), ...ids.slice(0, safeOffset)];
}

function getActivePlayers(players: ChainOfGreedPlayerState[]) {
  return players.filter((player) => !player.isEliminated);
}

function getPlayer(players: ChainOfGreedPlayerState[], id: string | null) {
  return players.find((player) => player.id === id) ?? null;
}

function getPlayerInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? 'P';
  const second = words.length > 1 ? words[1]?.[0] : words[0]?.[1];
  return `${first}${second ?? ''}`.toUpperCase();
}

function getSafeAvatarDisplay(player: ChainOfGreedPlayerState | null) {
  if (!player) return 'BB';
  const avatar = player.avatar.trim();
  const looksLikeRawImageText = /profile|photo|image|avatar|https?:|[/]|[a-f0-9]{8}/i.test(avatar);
  if (!avatar || avatar.length > 4 || looksLikeRawImageText) return getPlayerInitials(player.name);
  return avatar;
}

function buildIndividualOrder(ids: string[], turnsPerPlayer: number) {
  return Array.from({ length: turnsPerPlayer }, () => ids).flat();
}

function pickHumanVoteTarget(players: ChainOfGreedPlayerState[], humanId: string | null) {
  return players.find((player) => !player.isEliminated && player.id !== humanId)?.id ?? null;
}

function getStepBadge(step: number) {
  if (step === CHAIN_LADDER.length) return 'Max';
  return null;
}

function getPlayerTurnMessage(players: ChainOfGreedPlayerState[], turnOrder: string[]) {
  const firstPlayer = getPlayer(players, turnOrder[0] ?? null);
  return `${firstPlayer?.name ?? 'Player'} to play.`;
}

function getTurnOrderPlayerId(turnOrder: string[], turnIndex: number) {
  if (turnOrder.length === 0) return null;
  return turnOrder[turnIndex % turnOrder.length] ?? null;
}

function getActionVerb(choice: ChainAction) {
  return choice === 'bank' ? 'BANK' : choice === 'higher' ? 'HIGHER' : 'LOWER';
}

function getDecisionText(actorName: string, isHuman: boolean, choice: ChainAction) {
  return `${isHuman ? 'You' : actorName} chose ${getActionVerb(choice)}.`;
}

function getTurnVerdict(resolution: ChainActionResolution) {
  if (resolution.revealedNumber === null) return 'Bank secured';
  return resolution.wasCorrect ? 'Correct' : 'Wrong';
}

function getTurnConsequenceText(choice: ChainAction, resolution: ChainActionResolution, chainBefore: ChainOfGreedChainState) {
  const bankedAmount = Math.max(resolution.securedDelta, resolution.individualDelta);
  if (choice === 'bank') {
    return `Banked +${bankedAmount.toLocaleString()}. Chain reset. A guess is still required.`;
  }
  if (resolution.wasCorrect) {
    return `Chain Up. Step ${chainBefore.step} -> ${resolution.updatedChain.step}. Pot ${chainBefore.pot.toLocaleString()} -> ${resolution.updatedChain.pot.toLocaleString()}.`;
  }
  const lost = resolution.lostAmount.toLocaleString();
  return resolution.equalMiss
    ? `Chain Broken. Equal reveal. Lost ${lost}.`
    : `Chain Broken. Lost ${lost}.`;
}

function isBankAvailable(bankedTurn: { actorId: string; kind: TurnPhaseKind } | null, actorId: string | null, kind: TurnPhaseKind) {
  return !actorId || bankedTurn?.actorId !== actorId || bankedTurn.kind !== kind;
}

function getTurnHistoryMessage(actorName: string, choice: ChainAction, resolution: ChainActionResolution) {
  if (choice === 'bank') {
    return `${actorName} banked ${Math.max(resolution.securedDelta, resolution.individualDelta).toLocaleString()}.`;
  }
  const verdict = resolution.wasCorrect ? 'Correct' : 'Wrong';
  return `${actorName} guessed ${getActionVerb(choice)} — ${verdict}.`;
}

function getTurnTone(choice: ChainAction, resolution: ChainActionResolution): PendingTurnPipeline['tone'] {
  if (choice === 'bank') return 'bank';
  if (resolution.wasCorrect) return 'success';
  if (resolution.wasCorrect === false) return 'danger';
  return 'neutral';
}

function getLatestMoment(choice: ChainAction, resolution: ChainActionResolution): ChainOfGreedPlayerState['latestMoment'] {
  if (choice === 'bank') return 'bank';
  if (resolution.wasCorrect) return choice;
  return resolution.busted ? 'bust' : 'wrong';
}

function getNextTurnStatus(actorName: string, isHuman: boolean, choice: ChainAction, resolution: ChainActionResolution) {
  if (choice === 'bank') {
    return `${isHuman ? 'You' : actorName} banked ${Math.max(resolution.securedDelta, resolution.individualDelta).toLocaleString()}. ${isHuman ? 'Choose' : 'Still needs'} lower or higher next.`;
  }
  if (resolution.wasCorrect) {
    return `${isHuman ? 'You were' : `${actorName} was`} correct.`;
  }
  return `${isHuman ? 'You were' : `${actorName} was`} wrong.`;
}

function isDramaticAiTurn(turn: PendingTurnPipeline) {
  const bankedAmount = Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta);
  return (
    (turn.choice === 'bank' && bankedAmount >= 400) ||
    turn.resolution.lostAmount >= 400 ||
    turn.resolution.updatedChain.step >= 6 ||
    turn.chainBefore.step >= 6 ||
    turn.chainBefore.step >= CHAIN_LADDER.length - 1 ||
    turn.resolution.updatedChain.step >= CHAIN_LADDER.length
  );
}

function shouldFastWatchTurn(turn: PendingTurnPipeline, players: ChainOfGreedPlayerState[]) {
  const actor = getPlayer(players, turn.actorId);
  return Boolean(actor && !actor.isHuman && turn.kind !== 'final' && !isDramaticAiTurn(turn));
}

function getPipelineDuration(turn: PendingTurnPipeline) {
  if (turn.kind === 'final' && turn.choice === 'bank') return FAST_FINAL_BANK_PIPELINE_DURATIONS[turn.stage];
  return CHAIN_TURN_PIPELINE_DURATIONS[turn.stage];
}

function getAiWaitingText(pendingTurn: PendingTurnPipeline | null, isBankUsedThisTurn: boolean) {
  if (pendingTurn) return 'is resolving Fast Watch…';
  if (isBankUsedThisTurn) return 'must still guess…';
  return 'is reading the board…';
}

function getBankedHelperText(isHuman: boolean) {
  return isHuman
    ? 'Bank is spent for this turn. You still need a higher or lower guess.'
    : 'Bank is spent for this turn. A higher or lower guess is still required.';
}

function buildInitialState(props: GenericMinigameProps): ChainOfGreedState {
  const { rng } = createChainOfGreedRng(props.seed);
  const resolvedParticipants = resolveChainOfGreedParticipants(props);
  const players = createChainOfGreedPlayers(resolvedParticipants, rng);
  const activePlayers = getActivePlayers(players);
  const turnOrder = rotateOrder(activePlayers.map((player) => player.id), 0);
  return {
    phase: 'roundIntro',
    players,
    startingCount: activePlayers.length,
    roundNumber: 1,
    securedTotal: 0,
    roundSecured: 0,
    chain: createInitialChainState(rng),
    turnOrder,
    turnIndex: 0,
    turnsRemaining: getStandardRoundTurnCap(activePlayers.length),
    statusText: `Round 1. Build the chain. Bank before it breaks.`,
    helperText: TURN_HELPERS[0],
    turnHistory: [],
    showHelp: false,
    revealedNumber: null,
    humanVoteTargetId: pickHumanVoteTarget(players, players.find((player) => player.isHuman)?.id ?? null),
    pendingVotes: [],
    revealedVotes: 0,
    tieBreaks: [],
    eliminatedThisStep: [],
    semifinalOrder: [],
    semifinalTurnIndex: 0,
    semifinalScores: {},
    semifinalChains: {},
    semifinalTieBreak: null,
    semifinalEliminatedId: null,
    finalOrder: [],
    finalTurnIndex: 0,
    finalScores: {},
    finalChains: {},
    finalTieBreak: null,
    winnerId: null,
    spectatorMode: null,
    finalTimerExpiry: null,
    finalTimerPausedRemaining: null,
  };
}

export default function ChainOfGreed(props: GenericMinigameProps) {
  const [state, setState] = useState<ChainOfGreedState>(() => buildInitialState(props));
  const [isLadderSheetOpen, setIsLadderSheetOpen] = useState(false);
  const [isInsightsSheetOpen, setIsInsightsSheetOpen] = useState(false);
  const [pendingTurn, setPendingTurn] = useState<PendingTurnPipeline | null>(null);
  const [bankedTurn, setBankedTurn] = useState<{ actorId: string; kind: TurnPhaseKind } | null>(null);
  const [isResultCommitted, setIsResultCommitted] = useState(false);
  const [finalSecondsRemaining, setFinalSecondsRemaining] = useState<number | null>(null);
  const [finalDetailExpanded, setFinalDetailExpanded] = useState(false);
  const rngRef = useRef(createChainOfGreedRng(props.seed));
  const helperIndexRef = useRef(0);
  const aiTurnLockRef = useRef<string | null>(null);
  const voteRevealLockRef = useRef<string | null>(null);
  const resultCommitLockRef = useRef(false);
  const playerRailRef = useRef<HTMLDivElement | null>(null);
  const playerCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const activePlayers = useMemo(() => getActivePlayers(state.players), [state.players]);
  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const currentTurnPlayer = useMemo(
    () => state.phase === 'playerTurn' ? getPlayer(state.players, getTurnOrderPlayerId(state.turnOrder, state.turnIndex)) : null,
    [state.phase, state.players, state.turnIndex, state.turnOrder],
  );
  const semifinalPlayer = useMemo(
    () => state.phase === 'semifinalTurn' ? getPlayer(state.players, state.semifinalOrder[state.semifinalTurnIndex] ?? null) : null,
    [state.phase, state.players, state.semifinalOrder, state.semifinalTurnIndex],
  );
  const finalPlayer = useMemo(
    () => state.phase === 'finalTurn' ? getPlayer(state.players, state.finalOrder[state.finalTurnIndex] ?? null) : null,
    [state.phase, state.players, state.finalOrder, state.finalTurnIndex],
  );
  const summary = useMemo(() => summarizeRound(activePlayers), [activePlayers]);

  const nextHelper = useCallback((pool: string[]) => {
    helperIndexRef.current += 1;
    return pool[helperIndexRef.current % pool.length] ?? pool[0] ?? '';
  }, []);

  function setPhase(phase: Phase, partial: Partial<ChainOfGreedState> = {}) {
    setState((previous) => ({ ...previous, phase, ...partial }));
  }

  function startRound(roundNumber: number, players = state.players) {
    const nextPlayers = players.map((player) => player.isEliminated ? player : applyRoundReset(player));
    const livePlayers = getActivePlayers(nextPlayers);
    const nextChain = createInitialChainState(rngRef.current.rng);
    const turnOrder = rotateOrder(livePlayers.map((player) => player.id), roundNumber - 1);
    setPendingTurn(null);
    setBankedTurn(null);
    emitSoundCue('round-intro-sting');
    setState((previous) => ({
      ...previous,
      phase: 'roundIntro',
      players: nextPlayers,
      roundNumber,
      roundSecured: 0,
      chain: nextChain,
      turnOrder,
      turnIndex: 0,
      turnsRemaining: getStandardRoundTurnCap(livePlayers.length),
      revealedNumber: nextChain.referenceNumber,
      statusText: `Round ${roundNumber}. Build the chain. Bank before it breaks.`,
      helperText: TURN_HELPERS[0],
      humanVoteTargetId: pickHumanVoteTarget(nextPlayers, humanPlayer?.id ?? null),
      pendingVotes: [],
      revealedVotes: 0,
      tieBreaks: [],
      eliminatedThisStep: [],
    }));
  }

  const commitStandardTurn = useCallback((turn: PendingTurnPipeline) => {
    if (turn.choice === 'bank' && Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta) > 0) emitSoundCue('bank-secure-chime');
    if (turn.resolution.wasCorrect) emitSoundCue('correct-guess-tick');
    if (turn.resolution.wasCorrect === false) emitSoundCue('bust-impact');

    setBankedTurn(turn.choice === 'bank' ? { actorId: turn.actorId, kind: 'standard' } : null);

    setState((previous) => {
      const nextPlayers: ChainOfGreedPlayerState[] = previous.players.map((player) => {
        if (player.id !== turn.actorId) return player;
        return {
          ...player,
          turnsTakenThisRound: player.turnsTakenThisRound + (turn.turnEnds ? 1 : 0),
          roundContribution: player.roundContribution + turn.resolution.securedDelta,
          totalContribution: player.totalContribution + turn.resolution.securedDelta,
          roundCorrectGuesses: player.roundCorrectGuesses + (turn.resolution.wasCorrect ? 1 : 0),
          totalCorrectGuesses: player.totalCorrectGuesses + (turn.resolution.wasCorrect ? 1 : 0),
          roundWrongGuesses: player.roundWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
          totalWrongGuesses: player.totalWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
          roundBanks: player.roundBanks + (turn.choice === 'bank' ? 1 : 0),
          totalBanks: player.totalBanks + (turn.choice === 'bank' ? 1 : 0),
          roundBusts: player.roundBusts + (turn.resolution.busted ? 1 : 0),
          totalBusts: player.totalBusts + (turn.resolution.busted ? 1 : 0),
          latestMoment: getLatestMoment(turn.choice, turn.resolution),
        };
      });
      const nextHistory: ChainOfGreedTurnRecord[] = [turn.historyEntry, ...previous.turnHistory].slice(0, 10);
      const nextRoundSecured = previous.roundSecured + turn.resolution.securedDelta;
      const nextSecuredTotal = previous.securedTotal + turn.resolution.securedDelta;

      if (!turn.turnEnds) {
        return {
          ...previous,
          players: nextPlayers,
          chain: turn.resolution.updatedChain,
          turnHistory: nextHistory,
          roundSecured: nextRoundSecured,
          securedTotal: nextSecuredTotal,
          revealedNumber: turn.resolution.revealedNumber,
          statusText: getNextTurnStatus(turn.actorName, getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false, turn.choice, turn.resolution),
          helperText: getBankedHelperText(getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false),
        };
      }

      const nextTurnsRemaining = (turn.turnsRemainingBefore ?? previous.turnsRemaining) - 1;
      if (nextTurnsRemaining <= 0) {
        return {
          ...previous,
          players: nextPlayers,
          chain: turn.resolution.updatedChain,
          phase: 'roundSummary',
          turnsRemaining: 0,
          roundSecured: nextRoundSecured,
          securedTotal: nextSecuredTotal,
          turnHistory: nextHistory,
          revealedNumber: turn.resolution.revealedNumber,
          statusText: 'Take a moment and review the board.',
          helperText: 'Performance matters, but house feelings matter too.',
        };
      }

      const nextTurnIndex = (turn.turnIndexBefore ?? previous.turnIndex) + 1;
      const nextPlayer = getPlayer(nextPlayers, getTurnOrderPlayerId(previous.turnOrder, nextTurnIndex));
      return {
        ...previous,
        players: nextPlayers,
        chain: turn.resolution.updatedChain,
        phase: 'playerTurn',
        turnIndex: nextTurnIndex,
        turnsRemaining: nextTurnsRemaining,
        roundSecured: nextRoundSecured,
        securedTotal: nextSecuredTotal,
        turnHistory: nextHistory,
        revealedNumber: turn.resolution.revealedNumber,
        statusText: `${nextPlayer?.name ?? 'Player'} to play.`,
        helperText: nextHelper(TURN_HELPERS),
      };
    });
  }, [nextHelper]);

  const finishVoting = useCallback(() => {
    const votes = buildAiVoteRecords({
      activePlayers,
      roundNumber: state.roundNumber,
      seed: rngRef.current.seed,
      humanVoteTargetId: state.humanVoteTargetId,
    });
    const elimination = resolveVoteElimination({
      activePlayers,
      votes,
      eliminateCount: getStandardRoundEliminationCount(state.startingCount, state.roundNumber, activePlayers.length),
      rng: rngRef.current.rng,
    });
    emitSoundCue('vote-reveal-pulse');
    setState((previous) => ({
      ...previous,
      players: elimination.updatedPlayers,
      phase: 'voteReveal',
      pendingVotes: votes,
      revealedVotes: 0,
      tieBreaks: elimination.tieBreaks,
      eliminatedThisStep: elimination.eliminatedIds,
      statusText: 'The weakest link will now be decided.',
      helperText: 'One bad round can end the game.',
    }));
  }, [activePlayers, state.humanVoteTargetId, state.roundNumber, state.startingCount]);

  const commitIndividualTurn = useCallback((turn: PendingTurnPipeline) => {
    if (turn.choice === 'bank' && Math.max(turn.resolution.securedDelta, turn.resolution.individualDelta) > 0) emitSoundCue('bank-secure-chime');
    if (turn.resolution.wasCorrect) emitSoundCue('correct-guess-tick');
    if (turn.resolution.wasCorrect === false) emitSoundCue('bust-impact');

    setBankedTurn(turn.choice === 'bank' ? { actorId: turn.actorId, kind: turn.kind } : null);

    setState((previous) => {
      const chainMap = turn.kind === 'semifinal' ? previous.semifinalChains : previous.finalChains;
      const scoreMap = turn.kind === 'semifinal' ? previous.semifinalScores : previous.finalScores;
      const nextChains = { ...chainMap, [turn.actorId]: turn.resolution.updatedChain };
      const nextScores = { ...scoreMap, [turn.actorId]: (scoreMap[turn.actorId] ?? 0) + turn.resolution.individualDelta };
      const nextPlayers = previous.players.map((player) => {
        if (player.id !== turn.actorId) return player;
        const nextScore = nextScores[turn.actorId] ?? 0;
        return {
          ...player,
          latestMoment: getLatestMoment(turn.choice, turn.resolution),
          ...(turn.kind === 'semifinal'
            ? { semifinalScore: nextScore }
            : {
              finalScore: nextScore,
              finalWrongGuesses: player.finalWrongGuesses + (turn.resolution.wasCorrect === false ? 1 : 0),
              finalBanks: player.finalBanks + (turn.choice === 'bank' ? 1 : 0),
            }),
        };
      });
      const nextHistory: ChainOfGreedTurnRecord[] = [turn.historyEntry, ...previous.turnHistory].slice(0, 10);

      if (!turn.turnEnds) {
        return {
          ...previous,
          players: nextPlayers,
          turnHistory: nextHistory,
          revealedNumber: turn.resolution.revealedNumber,
          statusText: getNextTurnStatus(turn.actorName, getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false, turn.choice, turn.resolution),
          helperText: getBankedHelperText(getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false),
          ...(turn.kind === 'semifinal'
            ? { semifinalScores: nextScores, semifinalChains: nextChains }
            : {
              finalScores: nextScores,
              finalChains: nextChains,
              finalTimerExpiry: getPlayer(nextPlayers, turn.actorId)?.isHuman ? Date.now() + (previous.finalTimerPausedRemaining ?? FINAL_ROUND_DURATION_MS) : previous.finalTimerExpiry,
              finalTimerPausedRemaining: getPlayer(nextPlayers, turn.actorId)?.isHuman ? null : previous.finalTimerPausedRemaining,
            }),
        };
      }

      // Timed final: timer (not turn count) drives player advancement
      if (turn.kind === 'final') {
        return {
          ...previous,
          players: nextPlayers,
          turnHistory: nextHistory,
          revealedNumber: turn.resolution.revealedNumber,
          finalScores: nextScores,
          finalChains: nextChains,
          finalTimerExpiry: getPlayer(nextPlayers, turn.actorId)?.isHuman ? Date.now() + (previous.finalTimerPausedRemaining ?? FINAL_ROUND_DURATION_MS) : previous.finalTimerExpiry,
          finalTimerPausedRemaining: getPlayer(nextPlayers, turn.actorId)?.isHuman ? null : previous.finalTimerPausedRemaining,
          statusText: getNextTurnStatus(turn.actorName, getPlayer(nextPlayers, turn.actorId)?.isHuman ?? false, turn.choice, turn.resolution),
          helperText: nextHelper(FINAL_HELPERS),
        };
      }

      const nextTurnIndex = (turn.turnIndexBefore ?? 0) + 1;
      if (nextTurnIndex >= (turn.orderLength ?? 0)) {
        if (turn.kind === 'semifinal') {
          const invertedScores = Object.fromEntries(Object.entries(nextScores).map(([id, score]) => [id, -score]));
          const ranking = rankPlayersByScore(invertedScores, nextPlayers, rngRef.current.rng);
          const eliminated = ranking.ordered[0] ?? null;
          emitSoundCue('elimination-sting');
          return {
            ...previous,
            players: nextPlayers.map((player) => player.id === eliminated?.id ? { ...player, isEliminated: true } : player),
            phase: 'semifinalReveal',
            semifinalScores: nextScores,
            semifinalChains: nextChains,
            semifinalTieBreak: ranking.tieBreak,
            semifinalEliminatedId: eliminated?.id ?? null,
            turnHistory: nextHistory,
            revealedNumber: turn.resolution.revealedNumber,
            statusText: eliminated ? `${eliminated.name} leaves in third place.` : 'Semifinal complete.',
            helperText: 'Only two remain.',
          };
        }

        return { ...previous };
      }

      return {
        ...previous,
        players: nextPlayers,
        turnHistory: nextHistory,
        revealedNumber: turn.resolution.revealedNumber,
        statusText: `${getPlayer(nextPlayers, previous.semifinalOrder[nextTurnIndex] ?? null)?.name ?? 'Next player'} to play.`,
        helperText: nextHelper(FINAL_HELPERS),
        semifinalScores: nextScores,
        semifinalChains: nextChains,
        semifinalTurnIndex: nextTurnIndex,
      };
    });
  }, [nextHelper]);

  const resolveStandardAction = useCallback((actorId: string, choice: ChainAction) => {
    if (pendingTurn) return;
    const actor = getPlayer(state.players, actorId);
    if (!actor || (choice === 'bank' && state.chain.pot <= 0)) return;
    const resolution = resolveChainAction(choice, state.chain, rngRef.current.rng);
    setPendingTurn({
      actorId,
      actorName: actor.name,
      kind: 'standard',
      choice,
      stage: 'decision',
      referenceNumber: state.chain.referenceNumber,
      resolution,
      verdictText: getTurnVerdict(resolution),
      consequenceText: getTurnConsequenceText(choice, resolution, state.chain),
      tone: getTurnTone(choice, resolution),
      chainBefore: state.chain,
      turnEnds: choice !== 'bank',
      turnsRemainingBefore: state.turnsRemaining,
      turnIndexBefore: state.turnIndex,
      historyEntry: {
        actorId,
        actorName: actor.name,
        choice,
        referenceNumber: state.chain.referenceNumber,
        revealedNumber: resolution.revealedNumber,
        wasCorrect: resolution.wasCorrect,
        bankedAmount: resolution.securedDelta,
        lostAmount: resolution.lostAmount,
        message: getTurnHistoryMessage(actor.name, choice, resolution),
        phase: 'standard',
      },
    });
  }, [pendingTurn, state]);

  const resolveIndividualAction = useCallback((kind: 'semifinal' | 'final', actorId: string, choice: ChainAction) => {
    if (pendingTurn) return;
    const actor = getPlayer(state.players, actorId);
    const chainMap = kind === 'semifinal' ? state.semifinalChains : state.finalChains;
    const turnIndex = kind === 'semifinal' ? state.semifinalTurnIndex : state.finalTurnIndex;
    const order = kind === 'semifinal' ? state.semifinalOrder : state.finalOrder;
    const actorChain = chainMap[actorId];
    if (!actor || !actorChain) return;

    if (choice === 'bank' && actorChain.pot <= 0) return;
        if (kind === 'final' && actor.isHuman && state.finalTimerExpiry !== null) {
      const pausedRemaining = Math.max(0, state.finalTimerExpiry - Date.now());
      setState((previous) => ({
        ...previous,
        finalTimerExpiry: null,
        finalTimerPausedRemaining: pausedRemaining,
      }));
    }

    const resolution = resolveChainAction(choice, actorChain, rngRef.current.rng);
    setPendingTurn({
      actorId,
      actorName: actor.name,
      kind,
      choice,
      stage: 'decision',
      referenceNumber: actorChain.referenceNumber,
      resolution,
      verdictText: getTurnVerdict(resolution),
      consequenceText: getTurnConsequenceText(choice, resolution, actorChain),
      tone: getTurnTone(choice, resolution),
      chainBefore: actorChain,
      turnEnds: choice !== 'bank',
      turnIndexBefore: turnIndex,
      orderLength: order.length,
      historyEntry: {
        actorId,
        actorName: actor.name,
        choice,
        referenceNumber: actorChain.referenceNumber,
        revealedNumber: resolution.revealedNumber,
        wasCorrect: resolution.wasCorrect,
        bankedAmount: resolution.individualDelta,
        lostAmount: resolution.lostAmount,
        message: getTurnHistoryMessage(actor.name, choice, resolution),
        phase: kind,
      },
    });
  }, [pendingTurn, state]);

  function startSemifinal() {
    const finalists = getActivePlayers(state.players);
    const ids = finalists.map((player) => player.id);
    const order = buildIndividualOrder(ids, SEMIFINAL_TURNS_PER_PLAYER);
    const chains = Object.fromEntries(ids.map((id) => [id, createInitialChainState(rngRef.current.rng)]));
    const scores = Object.fromEntries(ids.map((id) => [id, 0]));
    setPendingTurn(null);
    setBankedTurn(null);
    emitSoundCue('final-showdown-sting');
    setState((previous) => ({
      ...previous,
      phase: 'semifinalTurn',
      semifinalOrder: order,
      semifinalTurnIndex: 0,
      semifinalScores: scores,
      semifinalChains: chains,
      semifinalTieBreak: null,
      semifinalEliminatedId: null,
      statusText: 'Final 3: Sudden Chain. Lowest score leaves.',
      helperText: nextHelper(FINAL_HELPERS),
      revealedNumber: Object.values(chains)[0]?.referenceNumber ?? null,
    }));
  }

  function startFinal() {
    const finalists = getActivePlayers(state.players);
    const ids = finalists.map((player) => player.id);
    const chains = Object.fromEntries(ids.map((id) => [id, createInitialChainState(rngRef.current.rng)]));
    const scores = Object.fromEntries(ids.map((id) => [id, 0]));
    const nextPlayers = state.players.map((player) => ids.includes(player.id)
      ? { ...player, finalScore: 0, finalWrongGuesses: 0, finalBanks: 0, latestMoment: null }
      : player);
    const firstPlayerId = ids[0] ?? null;
    const firstPlayer = getPlayer(nextPlayers, firstPlayerId);
    const firstIsHuman = Boolean(firstPlayer?.isHuman);
    setPendingTurn(null);
    setBankedTurn(null);
    emitSoundCue('final-showdown-sting');
    setState((previous) => ({
      ...previous,
      phase: 'finalTurn',
      players: nextPlayers,
      roundNumber: STANDARD_ROUND_COUNT + 1,
      finalOrder: ids,
      finalTurnIndex: 0,
      finalScores: scores,
      finalChains: chains,
      finalTieBreak: null,
      finalTimerExpiry: firstIsHuman ? Date.now() + FINAL_ROUND_DURATION_MS : null,
      finalTimerPausedRemaining: null,
      statusText: 'Round 6 Final. Bank the highest individual score.',
      helperText: 'Ties use fewer mistakes, then fewer banks.',
      revealedNumber: chains[firstPlayerId ?? '']?.referenceNumber ?? Object.values(chains)[0]?.referenceNumber ?? null,
    }));
  }

  const advanceFinalPlayer = useCallback(() => {
    setPendingTurn(null);
    setBankedTurn(null);
    setState((previous) => {
      const nextTurnIndex = previous.finalTurnIndex + 1;
      if (nextTurnIndex >= previous.finalOrder.length) {
        const ranking = rankFinalPlayersByScore(previous.finalScores, previous.players, rngRef.current.rng);
        emitSoundCue('winner-stinger');
        return {
          ...previous,
          phase: 'finalResult',
          finalTieBreak: ranking.tieBreak,
          finalTimerExpiry: null,
          finalTimerPausedRemaining: null,
          winnerId: ranking.ordered[0]?.id ?? null,
          statusText: `${ranking.ordered[0]?.name ?? 'A finalist'} wins everything.`,
          helperText: 'Only one player can claim the influence.',
        };
      }
      const nextPlayerId = previous.finalOrder[nextTurnIndex] ?? null;
      const nextPlayer = getPlayer(previous.players, nextPlayerId);
      const nextIsHuman = Boolean(nextPlayer?.isHuman);
      return {
        ...previous,
        finalTurnIndex: nextTurnIndex,
        finalTimerExpiry: nextIsHuman ? Date.now() + FINAL_ROUND_DURATION_MS : null,
        finalTimerPausedRemaining: null,
        revealedNumber: previous.finalChains[nextPlayerId ?? '']?.referenceNumber ?? null,
        statusText: `${nextPlayer?.name ?? 'Next finalist'} — 30 seconds.`,
        helperText: nextHelper(FINAL_HELPERS),
      };
    });
  }, [nextHelper]);

  const simulateFinalAiRound = useCallback((
    aiPlayer: ChainOfGreedPlayerState,
    startChain: ChainOfGreedChainState,
    startScore: number,
  ) => {
    const rng = rngRef.current.rng;
    let chain = startChain;
    let score = startScore;
    let mistakes = 0;
    let banks = 0;
    const simTurns = 6 + Math.floor(rng() * 7); // 6–12 representative turns for AI final simulation
    let bankAvailableForSim = true;
    for (let i = 0; i < simTurns; i++) {
      const choice = decideAiAction({
        player: aiPlayer,
        chain,
        remainingTurns: simTurns - i,
        phase: 'final',
        activePlayers: activePlayers,
        playerScore: score,
        bankAvailable: bankAvailableForSim,
      });
      const resolution = resolveChainAction(choice, chain, rng);
      score += resolution.individualDelta;
      mistakes += resolution.wasCorrect === false ? 1 : 0;
      banks += choice === 'bank' ? 1 : 0;
      chain = resolution.updatedChain;
      bankAvailableForSim = choice !== 'bank';
    }
    setState((previous) => {
      const nextScores = { ...previous.finalScores, [aiPlayer.id]: score };
      const nextChains = { ...previous.finalChains, [aiPlayer.id]: chain };
      const nextPlayers = previous.players.map((player) =>
        player.id === aiPlayer.id
          ? {
            ...player,
            finalScore: score,
            finalWrongGuesses: player.finalWrongGuesses + mistakes,
            finalBanks: player.finalBanks + banks,
          }
          : player,
      );
      return { ...previous, players: nextPlayers, finalScores: nextScores, finalChains: nextChains };
    });
    advanceFinalPlayer();
  }, [activePlayers, advanceFinalPlayer]);

  function continueAfterElimination() {
    const remaining = getActivePlayers(state.players);
    if (state.roundNumber >= STANDARD_ROUND_COUNT || remaining.length <= 2) {
      setPhase('finalIntro', {
        statusText: `Round ${STANDARD_ROUND_COUNT + 1}: LOH final.`,
        helperText: 'Every active player gets one 30-second chain.',
      });
      return;
    }
    startRound(state.roundNumber + 1, state.players);
  }

  function finishGame() {
    const winnerId = state.winnerId ?? activePlayers[0]?.id ?? humanPlayer?.id ?? null;
    if (!winnerId || resultCommitLockRef.current) return;
    resultCommitLockRef.current = true;
    setIsResultCommitted(true);
    const rawResults = buildFinalRawResults(state.players, winnerId, state.securedTotal);
    props.onFinish?.(rawResults[humanPlayer?.id ?? winnerId] ?? state.securedTotal, undefined, {
      authoritativeWinnerId: winnerId,
      rawValue: rawResults[humanPlayer?.id ?? winnerId] ?? state.securedTotal,
      rawResults,
    });
  }

  const dismissRoundIntro = useCallback(() => {
    setState((previous) => {
      if (previous.phase !== 'roundIntro') return previous;
      return {
        ...previous,
        phase: 'playerTurn',
        statusText: getPlayerTurnMessage(previous.players, previous.turnOrder),
        helperText: nextHelper(TURN_HELPERS),
      };
    });
  }, [nextHelper]);

  useEffect(() => {
    if (!pendingTurn) return;
    const timer = window.setTimeout(() => {
      if (pendingTurn.stage === 'settle') {
        if (pendingTurn.kind === 'standard') {
          commitStandardTurn(pendingTurn);
        } else {
          commitIndividualTurn(pendingTurn);
        }
        setPendingTurn(null);
        return;
      }

      setPendingTurn((previous) => previous ? { ...previous, stage: TURN_PIPELINE_STAGE_ORDER[previous.stage as Exclude<TurnPipelineStage, 'settle'>] } : previous);
    }, shouldFastWatchTurn(pendingTurn, state.players) ? FAST_AI_PIPELINE_DURATIONS[pendingTurn.stage] : getPipelineDuration(pendingTurn));
    return () => window.clearTimeout(timer);
  }, [commitIndividualTurn, commitStandardTurn, pendingTurn, state.players]);

  useEffect(() => {
    if (state.phase !== 'playerTurn' || !currentTurnPlayer || currentTurnPlayer.isHuman || pendingTurn) return;
    const bankAvailable = isBankAvailable(bankedTurn, currentTurnPlayer.id, 'standard');
    const lockKey = `${state.roundNumber}:${state.turnIndex}:${currentTurnPlayer.id}:${bankAvailable ? 'fresh' : 'banked'}`;
    if (aiTurnLockRef.current === lockKey) return;
    aiTurnLockRef.current = lockKey;
    const timer = window.setTimeout(() => {
      resolveStandardAction(currentTurnPlayer.id, decideAiAction({
        player: currentTurnPlayer,
        chain: state.chain,
        remainingTurns: state.turnsRemaining,
        phase: 'standard',
        activePlayers,
        bankAvailable,
      }));
    }, bankAvailable ? 220 + Math.round(rngRef.current.rng() * 180) : 160);
    return () => window.clearTimeout(timer);
  }, [activePlayers, bankedTurn, currentTurnPlayer, pendingTurn, resolveStandardAction, state.chain, state.phase, state.roundNumber, state.turnIndex, state.turnsRemaining]);

  useEffect(() => {
    if (state.phase !== 'voting') return;
    if (humanPlayer && !humanPlayer.isEliminated) return;
    finishVoting();
  }, [finishVoting, humanPlayer, state.phase]);

  useEffect(() => {
    if (state.phase !== 'voteReveal') return;
    const lockKey = `${state.revealedVotes}:${state.pendingVotes.length}`;
    if (voteRevealLockRef.current === lockKey) return;
    voteRevealLockRef.current = lockKey;
    if (state.revealedVotes >= state.pendingVotes.length) {
      emitSoundCue('elimination-sting');
      setPhase('eliminationReveal', {
        statusText: 'Vote reveal complete.',
        helperText: 'The weakest link has been decided.',
      });
      return;
    }
    const timer = window.setTimeout(() => {
      emitSoundCue('vote-reveal-pulse');
      setState((previous) => ({
        ...previous,
        revealedVotes: previous.revealedVotes + 1,
        statusText: `${previous.pendingVotes[previous.revealedVotes]?.voterName ?? 'House'} votes ${previous.pendingVotes[previous.revealedVotes]?.targetName ?? ''}.`,
        helperText: previous.pendingVotes[previous.revealedVotes]?.reason ?? 'The weakest link is not always the weakest player.',
      }));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [state.pendingVotes, state.phase, state.revealedVotes]);

  useEffect(() => {
    if (state.phase !== 'roundIntro') return;
    const timer = window.setTimeout(dismissRoundIntro, ROUND_INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dismissRoundIntro, state.phase]);

  useEffect(() => {
    if (state.phase !== 'semifinalTurn' || !semifinalPlayer || semifinalPlayer.isHuman || pendingTurn) return;
    const bankAvailable = isBankAvailable(bankedTurn, semifinalPlayer.id, 'semifinal');
    const lockKey = `semi:${state.semifinalTurnIndex}:${semifinalPlayer.id}:${bankAvailable ? 'fresh' : 'banked'}`;
    if (aiTurnLockRef.current === lockKey) return;
    aiTurnLockRef.current = lockKey;
    const timer = window.setTimeout(() => {
      const turnsUsed = state.semifinalOrder.slice(0, state.semifinalTurnIndex + 1).filter((id) => id === semifinalPlayer.id).length;
      resolveIndividualAction('semifinal', semifinalPlayer.id, decideAiAction({
        player: semifinalPlayer,
        chain: state.semifinalChains[semifinalPlayer.id],
        remainingTurns: SEMIFINAL_TURNS_PER_PLAYER - turnsUsed + 1,
        phase: 'semifinal',
        activePlayers,
        playerScore: state.semifinalScores[semifinalPlayer.id] ?? 0,
        bankAvailable,
      }));
    }, bankAvailable ? 240 + Math.round(rngRef.current.rng() * 160) : 160);
    return () => window.clearTimeout(timer);
  }, [activePlayers, bankedTurn, pendingTurn, resolveIndividualAction, semifinalPlayer, state.phase, state.semifinalChains, state.semifinalOrder, state.semifinalScores, state.semifinalTurnIndex]);

  useEffect(() => {
    if (state.phase !== 'finalTurn' || !finalPlayer || finalPlayer.isHuman || pendingTurn) return;
    if (state.finalTimerExpiry) return; // already running a human timer
    // AI player: simulate their 30-second window instantly
    const lockKey = `final:sim:${state.finalTurnIndex}:${finalPlayer.id}`;
    if (aiTurnLockRef.current === lockKey) return;
    aiTurnLockRef.current = lockKey;
    const currentChain = state.finalChains[finalPlayer.id] ?? createInitialChainState(rngRef.current.rng);
    const currentScore = state.finalScores[finalPlayer.id] ?? 0;
    const timer = window.setTimeout(() => {
      simulateFinalAiRound(finalPlayer, currentChain, currentScore);
    }, CHAIN_TURN_PIPELINE_DURATIONS.settle);
    return () => window.clearTimeout(timer);
  }, [finalPlayer, pendingTurn, simulateFinalAiRound, state.finalChains, state.finalScores, state.finalTimerExpiry, state.finalTurnIndex, state.phase]);

  // Human final timer: auto-advance when 30 seconds expire
  useEffect(() => {
    if (state.phase !== 'finalTurn' || !state.finalTimerExpiry || pendingTurn) return;
    const remaining = state.finalTimerExpiry - Date.now();
    if (remaining <= 0) {
      advanceFinalPlayer();
      return;
    }
    const timer = window.setTimeout(() => advanceFinalPlayer(), remaining);
    return () => window.clearTimeout(timer);
  }, [advanceFinalPlayer, pendingTurn, state.finalTimerExpiry, state.phase]);

  // Countdown display for the human final timer
  useEffect(() => {
    if (state.phase !== 'finalTurn' || (!state.finalTimerExpiry && state.finalTimerPausedRemaining === null)) {
      setFinalSecondsRemaining(null);
      return;
    }
    const update = () => {
      if (state.finalTimerPausedRemaining !== null) {
        setFinalSecondsRemaining(Math.max(0, Math.ceil(state.finalTimerPausedRemaining / 1000)));
        return;
      }
      const expiry = state.finalTimerExpiry;
      if (!expiry) return;
      setFinalSecondsRemaining(Math.max(0, Math.ceil((expiry - Date.now()) / 1000)));
    };
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [state.finalTimerExpiry, state.finalTimerPausedRemaining, state.phase]);

  const currentActor = currentTurnPlayer ?? semifinalPlayer ?? finalPlayer;
  const actionTargetId = currentActor?.id ?? null;
  const actionTargetKind = state.phase === 'playerTurn'
    ? 'standard'
    : state.phase === 'semifinalTurn'
      ? 'semifinal'
      : state.phase === 'finalTurn'
        ? 'final'
        : null;
  const baseChain = state.phase === 'semifinalTurn'
    ? (semifinalPlayer ? state.semifinalChains[semifinalPlayer.id] : null)
    : state.phase === 'finalTurn'
      ? (finalPlayer ? state.finalChains[finalPlayer.id] : null)
      : state.chain;
  const showPendingResolvedState = pendingTurn?.stage === 'ladderUpdate' || pendingTurn?.stage === 'settle';
  const displayedChain = pendingTurn && showPendingResolvedState ? pendingTurn.resolution.updatedChain : baseChain;
  const referenceNumber = pendingTurn
    ? (showPendingResolvedState ? pendingTurn.resolution.updatedChain.referenceNumber : pendingTurn.referenceNumber)
    : displayedChain?.referenceNumber ?? 0;
  const activeStep = displayedChain?.step ?? 0;
  const activePot = displayedChain?.pot ?? 0;
  const revealedVotes = state.pendingVotes.slice(0, state.revealedVotes);
  const winner = getPlayer(state.players, state.winnerId);
  const standardTurnLabels = state.phase === 'playerTurn' && currentTurnPlayer?.isHuman;
  const semifinalTurnLabels = state.phase === 'semifinalTurn' && semifinalPlayer?.isHuman;
  const finalTurnLabels = state.phase === 'finalTurn' && finalPlayer?.isHuman;
  const isHumanTurn = Boolean(standardTurnLabels || semifinalTurnLabels || finalTurnLabels);
  const showStickyActionBar = state.phase === 'playerTurn' || state.phase === 'semifinalTurn' || state.phase === 'finalTurn';
  const currentChainStep = activeStep || 0;
  const nextReward = CHAIN_LADDER[Math.min(currentChainStep, CHAIN_LADDER.length - 1)] ?? CHAIN_LADDER[CHAIN_LADDER.length - 1];
  const currentPotLabel = activePot > 0 ? activePot.toLocaleString() : '0';
  const isAtStartingPosition = currentChainStep === 0;
  const referenceRungIndex = currentChainStep === 0 ? 1 : currentChainStep;
  const nextRewardValueLabel = nextReward.toLocaleString();
  const chainStatusText = {
    step: `Step ${currentChainStep}/${CHAIN_LADDER.length}`,
    pot: `Pot ${currentPotLabel}`,
    next: `Next ${nextRewardValueLabel}`,
  };
  const ladderSteps = [...CHAIN_LADDER].reverse().map((value, index) => {
    const step = CHAIN_LADDER.length - index;
    return {
      value,
      step,
      badge: getStepBadge(step),
      isActive: currentChainStep === step,
      isCleared: currentChainStep > step,
      isNext: currentChainStep + 1 === step,
      carriesReference: !isAtStartingPosition && step === referenceRungIndex,
      labelSide: step === 1 || step === CHAIN_LADDER.length ? 'center' : step % 2 === 0 ? 'left' : 'right',
      tension: step >= 7 ? 'danger' : step >= 4 ? 'surge' : 'base',
    };
  });
  const lastTurn = state.turnHistory[0] ?? null;
  const turnComparisonSymbol = pendingTurn?.choice ? (momentGlyphs[pendingTurn.choice] ?? null) : null;
  const heroKicker = isHumanTurn
    ? 'YOUR TURN'
    : currentActor
      ? pendingTurn && shouldFastWatchTurn(pendingTurn, state.players)
        ? 'HOUSE FAST WATCH'
        : `${currentActor.name.toUpperCase()} IS THINKING`
      : state.phase === 'voteReveal'
        ? 'VOTE REVEAL'
        : state.phase === 'voting'
          ? 'WEAKEST LINK VOTE'
          : state.phase.startsWith('final')
            ? 'FINAL SHOWDOWN'
            : state.phase.startsWith('semifinal')
              ? 'SUDDEN CHAIN'
              : `ROUND ${state.roundNumber}`;
  const heroPhaseChip = state.phase === 'playerTurn'
    ? 'Shared chain'
    : state.phase === 'semifinalTurn'
      ? 'Individual semifinal'
      : state.phase === 'finalTurn'
        ? 'Winner-take-all'
        : state.phase === 'voting'
          ? 'Vote phase'
          : state.phase === 'roundSummary'
            ? 'Round summary'
            : state.phase === 'voteReveal'
              ? 'Vote reveal'
              : state.phase === 'eliminationReveal'
                ? 'Elimination'
                : state.phase.startsWith('final')
                  ? 'Final stage'
                  : state.phase.startsWith('semifinal')
                    ? 'Semifinal stage'
                    : 'Broadcast pause';
  const heroCommentary = pendingTurn
    ? (
      pendingTurn.stage === 'decision'
        ? getDecisionText(pendingTurn.actorName, getPlayer(state.players, pendingTurn.actorId)?.isHuman ?? false, pendingTurn.choice)
        : (pendingTurn.stage === 'reveal' || pendingTurn.stage === 'verdict')
          ? pendingTurn.verdictText
          : pendingTurn.consequenceText
    )
    : lastTurn?.message ?? state.statusText;
  const heroTone = pendingTurn
    ? (pendingTurn.stage === 'decision' ? (pendingTurn.choice === 'bank' ? 'bank' : 'neutral') : pendingTurn.tone)
    : lastTurn?.message?.toLowerCase().includes('wrong') || lastTurn?.message?.toLowerCase().includes('lost') || lastTurn?.message?.toLowerCase().includes('miss')
      ? 'danger'
      : lastTurn?.choice === 'bank'
        ? 'bank'
        : lastTurn?.wasCorrect
          ? 'success'
          : 'neutral';
  const playerMetricText = (player: ChainOfGreedPlayerState) => {
    if (state.phase === 'finalTurn' || state.phase === 'finalResult') return `${player.finalScore} final`;
    if (state.phase === 'semifinalTurn' || state.phase === 'semifinalReveal') return `${player.semifinalScore} semi`;
    return `${player.totalContribution} secured`;
  };
  const isBankUsedThisTurn = Boolean(actionTargetKind && !isBankAvailable(bankedTurn, actionTargetId, actionTargetKind));
  const isBankEmpty = activePot <= 0;
  const isActionLocked = Boolean(pendingTurn);
  const panelActor = pendingTurn ? getPlayer(state.players, pendingTurn.actorId) : currentActor;
  const panelActorName = panelActor?.name ?? pendingTurn?.actorName ?? heroPhaseChip;
  const panelAvatar = getSafeAvatarDisplay(panelActor);
  const panelModeLabel = pendingTurn
    ? getActionVerb(pendingTurn.choice)
    : isHumanTurn
      ? 'YOUR TURN'
      : currentActor
        ? 'READING THE BOARD'
        : heroKicker;
  const panelNumberLabel = pendingTurn
    && pendingTurn.choice !== 'bank'
    && pendingTurn.stage !== 'decision'
    && pendingTurn.resolution.revealedNumber !== null
    ? `${pendingTurn.referenceNumber} ${turnComparisonSymbol ?? ''} ${pendingTurn.resolution.revealedNumber}`
    : `${referenceNumber}`;
  const panelStatusText = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? 'LOCKED IN'
      : pendingTurn.verdictText.toUpperCase()
    : isHumanTurn
      ? 'Choose move'
      : currentActor
        ? 'Reading the board'
        : heroCommentary;
  const panelDetailText = pendingTurn
    ? pendingTurn.stage === 'decision'
      ? `Pot ${currentPotLabel} - Next ${nextRewardValueLabel}`
      : pendingTurn.choice === 'bank'
        ? `+${Math.max(pendingTurn.resolution.securedDelta, pendingTurn.resolution.individualDelta).toLocaleString()} secured - Current ${pendingTurn.resolution.updatedChain.referenceNumber}`
        : pendingTurn.consequenceText
    : `Pot ${currentPotLabel} - Next ${nextRewardValueLabel}`;
  const panelTone = pendingTurn ? pendingTurn.tone : heroTone;
  const participantLogText = lastTurn?.message ?? 'Live feed - no turns yet';
  useEffect(() => {
    if (!bankedTurn) return;
    if (!actionTargetId || !actionTargetKind || bankedTurn.actorId !== actionTargetId || bankedTurn.kind !== actionTargetKind) {
      setBankedTurn(null);
    }
  }, [actionTargetId, actionTargetKind, bankedTurn]);

  useEffect(() => {
    if (!currentActor) return;
    const card = playerCardRefs.current[currentActor.id];
    if (!card) return;
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [currentActor]);
  const handleAction = (choice: ChainAction) => {
    if (!actionTargetId || !actionTargetKind || isActionLocked || (choice === 'bank' && (isBankUsedThisTurn || isBankEmpty))) return;
    if (actionTargetKind === 'standard') {
      resolveStandardAction(actionTargetId, choice);
      return;
    }
    resolveIndividualAction(actionTargetKind, actionTargetId, choice);
  };
  const playerRail = (
    <div className="chain-of-greed__player-rail" data-testid="chain-player-rail" ref={playerRailRef}>
      {state.players.map((player) => {
        const isCurrent = currentTurnPlayer?.id === player.id || semifinalPlayer?.id === player.id || finalPlayer?.id === player.id;
        const latestMoment = player.latestMoment ? momentGlyphs[player.latestMoment] : momentGlyphs.safe;
        return (
          <article
            key={player.id}
            className={[
              'chain-of-greed__rail-card',
              player.isHuman ? 'chain-of-greed__rail-card--human' : '',
              isCurrent ? 'chain-of-greed__rail-card--current' : '',
              player.isEliminated ? 'chain-of-greed__rail-card--eliminated' : '',
            ].filter(Boolean).join(' ')}
            data-testid={`chain-player-${player.id}`}
            ref={(element) => { playerCardRefs.current[player.id] = element; }}
          >
            <div className="chain-of-greed__rail-avatar">{getSafeAvatarDisplay(player)}</div>
            <div className="chain-of-greed__rail-copy">
              <strong>{player.name}</strong>
              <span>{playerMetricText(player)}</span>
            </div>
            <span className="chain-of-greed__rail-badge">{player.isEliminated ? 'OUT' : latestMoment}</span>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="chain-of-greed" data-testid="chain-of-greed">
      <div className="chain-of-greed__backdrop" />
      <AnimatePresence>
        {state.phase === 'roundIntro' && (
          <motion.div
            className="chain-of-greed__round-intro-overlay"
            data-testid="chain-round-intro"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dismissRoundIntro();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="chain-of-greed__round-intro-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chain-round-intro-title"
              onPointerDown={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <span>Round {state.roundNumber}</span>
              <h2 id="chain-round-intro-title">Build the chain.</h2>
              <p>Bank before it breaks.</p>
              <small>Tap outside to continue</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="chain-of-greed__shell">
        <header className="chain-of-greed__header">
          <div className="chain-of-greed__header-row">
            <div className="chain-of-greed__hud">
              <div className="chain-of-greed__status-pill">
                <strong>{activePlayers.length} left</strong>
              </div>
              <div className="chain-of-greed__status-pill chain-of-greed__status-pill--gold">
                <strong>{state.securedTotal.toLocaleString()} secured</strong>
              </div>
            </div>
            <div className="chain-of-greed__header-actions">
              <button
                type="button"
                className="chain-of-greed__icon-button"
                aria-label="Open help"
                onClick={() => setState((previous) => ({ ...previous, showHelp: !previous.showHelp }))}
              >
                <span className="chain-of-greed__help-icon" aria-hidden="true">?</span>
              </button>
              <button
                type="button"
                className="chain-of-greed__icon-button"
                aria-label="Open round insights"
                onClick={() => setIsInsightsSheetOpen(true)}
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
          </div>
        </header>

        <main className="chain-of-greed__main">
          <motion.section
            className={`chain-of-greed__hero-stage chain-of-greed__hero-stage--${heroTone}`}
            animate={{
              scale: heroTone === 'danger' ? [1, 1.018, 1] : heroTone === 'success' ? [1, 1.01, 1] : 1,
              boxShadow: heroTone === 'danger'
                ? '0 22px 52px rgba(120, 16, 16, 0.34)'
                : heroTone === 'bank'
                  ? '0 22px 52px rgba(129, 90, 12, 0.32)'
                  : heroTone === 'success'
                    ? '0 22px 52px rgba(19, 84, 154, 0.32)'
                    : '0 18px 42px rgba(0, 0, 0, 0.28)',
            }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
          >
            <div className="chain-of-greed__stage-core" data-testid="chain-broadcast-board">
              <AnimatePresence initial={false}>
                {lastTurn && heroTone !== 'neutral' && (
                  <motion.div
                    key={`${lastTurn.actorId ?? 'house'}-${lastTurn.choice}-${lastTurn.revealedNumber ?? 'hidden'}-${heroTone}`}
                    className={`chain-of-greed__hero-impact chain-of-greed__hero-impact--${heroTone}`}
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: [0, 0.72, 0], scale: [0.92, 1.02, 1.08] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                  />
                )}
              </AnimatePresence>
              <div
                role="button"
                tabIndex={0}
                aria-label="Open chain ladder board"
                className="chain-of-greed__ladder-stage"
                data-testid="chain-ladder-stage"
                onClick={() => setIsLadderSheetOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setIsLadderSheetOpen(true);
                  }
                }}
              >
                <div className={`chain-of-greed__number-aura chain-of-greed__number-aura--${heroTone}`} aria-hidden="true" />
                <ol className="chain-of-greed__ladder-track" aria-label="Current chain ladder">
                  {ladderSteps.map(({ value, step, badge, isActive, isCleared, isNext, carriesReference, labelSide, tension }) => (
                    <li
                      key={value}
                      className={[
                        'chain-of-greed__ladder-node',
                        isActive ? 'chain-of-greed__ladder-node--active' : '',
                        isCleared ? 'chain-of-greed__ladder-node--cleared' : '',
                        isNext ? 'chain-of-greed__ladder-node--next' : '',
                        carriesReference ? 'chain-of-greed__ladder-node--reference' : '',
                        `chain-of-greed__ladder-node--${tension}`,
                      ].filter(Boolean).join(' ')}
                    >
                      <span className={[
                        'chain-of-greed__ladder-step-copy',
                        `chain-of-greed__ladder-step-copy--${labelSide}`,
                      ].join(' ')}>
                        <strong>{value.toLocaleString()}</strong>
                        <small>{badge ?? `Step ${step}`}</small>
                      </span>
                      <span className="chain-of-greed__ladder-node-main">
                        <span className="chain-of-greed__ladder-rail" aria-hidden="true" />
                        <span className="chain-of-greed__ladder-dot" aria-hidden="true" />
                        {carriesReference && (
                          <span className="chain-of-greed__current-cluster">
                            <span className="chain-of-greed__current-badge">Current</span>
                            <motion.span
                              className="chain-of-greed__number-tag"
                              key={`reference-${referenceNumber}-${state.revealedNumber}`}
                              initial={{ opacity: 0, y: 10, scale: 0.92 }}
                              animate={{ opacity: currentActor && !isHumanTurn ? 0.82 : 1, y: 0, scale: 1 }}
                              transition={{ duration: 0.26, ease: 'easeOut' }}
                            >
                              {referenceNumber}
                            </motion.span>
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
                {isAtStartingPosition && (
                  <div className="chain-of-greed__current-anchor" data-testid="chain-current-anchor">
                    <span className="chain-of-greed__current-anchor-main">
                      <span className="chain-of-greed__ladder-dot chain-of-greed__ladder-dot--anchor" aria-hidden="true" />
                      <span className="chain-of-greed__current-cluster">
                        <span className="chain-of-greed__current-badge">Current</span>
                        <motion.span
                          className="chain-of-greed__number-tag"
                          key={`reference-${referenceNumber}-${state.revealedNumber}-anchor`}
                          initial={{ opacity: 0, y: 10, scale: 0.92 }}
                          animate={{ opacity: currentActor && !isHumanTurn ? 0.82 : 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.26, ease: 'easeOut' }}
                        >
                          {referenceNumber}
                        </motion.span>
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <aside className={[
                'chain-of-greed__participant-panel',
                `chain-of-greed__participant-panel--${panelTone}`,
              ].filter(Boolean).join(' ')} data-testid="chain-participant-panel" aria-live="polite">
                <div className="chain-of-greed__participant-topline">
                  <span className="chain-of-greed__participant-avatar" aria-hidden="true">{panelAvatar}</span>
                  <div className="chain-of-greed__participant-name">
                    <span>{panelModeLabel}</span>
                    <strong>{panelActorName}</strong>
                  </div>
                </div>
                <div className="chain-of-greed__participant-number">{panelNumberLabel}</div>
                <div className="chain-of-greed__participant-status">{panelStatusText}</div>
                <p className="chain-of-greed__participant-detail">{panelDetailText}</p>
                <div className="chain-of-greed__participant-log" data-testid="chain-participant-log">
                  <span>Log</span>
                  <strong>{participantLogText}</strong>
                </div>
              </aside>
            </div>
            <div className="chain-of-greed__hero-status">
              <div className="chain-of-greed__inline-status" data-testid="chain-inline-status">
                <span aria-label={`Step ${currentChainStep} of ${CHAIN_LADDER.length}`}>{chainStatusText.step}</span>
                <span aria-label={`Pot ${currentPotLabel}`}>{chainStatusText.pot}</span>
                <span aria-label={`Next reward ${nextReward.toLocaleString()}`}>{chainStatusText.next}</span>
              </div>
              {finalSecondsRemaining !== null && (
                <div
                  className={['chain-of-greed__final-timer', finalSecondsRemaining <= 5 ? 'chain-of-greed__final-timer--urgent' : ''].filter(Boolean).join(' ')}
                  aria-label={`${finalSecondsRemaining} seconds remaining`}
                >
                  <span className="chain-of-greed__final-timer-value">{finalSecondsRemaining}</span>
                  <span className="chain-of-greed__final-timer-label">s left</span>
                </div>
              )}
            </div>
          </motion.section>

          {showStickyActionBar && (
            <motion.footer
              className="chain-of-greed__action-bar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
            >
              {isHumanTurn ? (
                <div className="chain-of-greed__buttons">
                  <button
                    type="button"
                    className={['chain-of-greed__action', 'chain-of-greed__action--lower', pendingTurn?.choice === 'lower' ? 'chain-of-greed__action--selected' : ''].filter(Boolean).join(' ')}
                    disabled={isActionLocked}
                    onClick={() => handleAction('lower')}
                  >
                    Lower
                  </button>
                  <button
                    type="button"
                    className={['chain-of-greed__action', 'chain-of-greed__action--bank', pendingTurn?.choice === 'bank' ? 'chain-of-greed__action--selected' : '', isBankUsedThisTurn ? 'chain-of-greed__action--spent' : ''].filter(Boolean).join(' ')}
                    disabled={isActionLocked || isBankUsedThisTurn || isBankEmpty}
                    title={isBankEmpty ? 'Build the chain before banking.' : undefined}
                    onClick={() => handleAction('bank')}
                  >
                    {isBankUsedThisTurn ? 'Banked' : 'Bank'}
                  </button>
                  <button
                    type="button"
                    className={['chain-of-greed__action', 'chain-of-greed__action--higher', pendingTurn?.choice === 'higher' ? 'chain-of-greed__action--selected' : ''].filter(Boolean).join(' ')}
                    disabled={isActionLocked}
                    onClick={() => handleAction('higher')}
                  >
                    Higher
                  </button>
                </div>
              ) : (
                <div className="chain-of-greed__ai-waiting">
                  <strong>{currentActor?.name ?? 'The house'}</strong>
                  <span>{getAiWaitingText(pendingTurn, isBankUsedThisTurn)}</span>
                </div>
              )}
            </motion.footer>
          )}


          {playerRail}
        </main>
      </div>

      <AnimatePresence>
        {isLadderSheetOpen && (
          <motion.div className="chain-of-greed__overlay chain-of-greed__overlay--sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="chain-of-greed__modal chain-of-greed__modal--sheet" initial={{ y: 44, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 44, opacity: 0 }}>
              <div className="chain-of-greed__sheet-header">
                <div>
                  <div className="chain-of-greed__eyebrow">Full ladder</div>
                  <h2>Chain rewards</h2>
                </div>
                <button type="button" className="chain-of-greed__help-button" onClick={() => setIsLadderSheetOpen(false)}>Close</button>
              </div>
              <ol className="chain-of-greed__ladder">
                {ladderSteps.map(({ value, step, badge, isActive, isCleared }) => (
                  <li
                    key={value}
                    className={[
                      'chain-of-greed__ladder-step',
                      isActive ? 'chain-of-greed__ladder-step--active' : '',
                      isCleared ? 'chain-of-greed__ladder-step--cleared' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div>
                      <span>Step {step}</span>
                      {badge && <small className="chain-of-greed__step-tag">{badge}</small>}
                    </div>
                    <strong>{value.toLocaleString()}</strong>
                  </li>
                ))}
              </ol>
            </motion.div>
          </motion.div>
        )}

        {isInsightsSheetOpen && (
          <motion.div className="chain-of-greed__overlay chain-of-greed__overlay--sheet" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="chain-of-greed__modal chain-of-greed__modal--sheet" initial={{ y: 44, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 44, opacity: 0 }}>
              <div className="chain-of-greed__sheet-header">
                <div>
                  <div className="chain-of-greed__eyebrow">Round insight</div>
                  <h2>Review the board</h2>
                </div>
                <button type="button" className="chain-of-greed__help-button" onClick={() => setIsInsightsSheetOpen(false)}>Close</button>
              </div>
              <div className="chain-of-greed__summary-grid">
                <div><span>Round bank</span><strong>{state.roundSecured.toLocaleString()}</strong></div>
                <div><span>Most correct</span><strong>{summary.mostCorrect ? `${summary.mostCorrect.name} (${summary.mostCorrect.roundCorrectGuesses})` : '—'}</strong></div>
                <div><span>Biggest buster</span><strong>{summary.biggestBuster ? `${summary.biggestBuster.name} (${summary.biggestBuster.roundBusts})` : '—'}</strong></div>
                <div><span>Prize pool</span><strong>{formatInfluence(state.securedTotal)}</strong></div>
              </div>
              <div className="chain-of-greed__history-card chain-of-greed__history-card--sheet">
                <div className="chain-of-greed__panel-title">Recent chain history</div>
                <ul>
                  {state.turnHistory.slice(0, 5).map((entry, index) => (
                    <li key={`${entry.actorId}-${index}-${entry.referenceNumber}-${entry.choice}-${entry.revealedNumber}`}>
                      <strong>{entry.actorName}</strong> — {entry.message}
                    </li>
                  ))}
                  {state.turnHistory.length === 0 && <li>No turns yet. The chain is waiting.</li>}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {state.showHelp && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">How it works</div>
            <h2>Keep the chain alive</h2>
            <ul className="chain-of-greed__rules-list">
              <li>Guess higher or lower to grow the chain from 50 up to 1300.</li>
              <li>Bank secures the active pot, keeps the reference number, and resets the chain.</li>
              <li>A wrong guess destroys only the active pot. Equal numbers count as a miss.</li>
              <li>There are five standard rounds, each ending with weakest-link votes.</li>
              <li>Round 6 is the LOH final: every active player gets 30 seconds to build an individual chain.</li>
              <li>Highest final score becomes LOH. Ties use fewer final mistakes, then fewer final banks.</li>
            </ul>
            <button type="button" className="chain-of-greed__continue" onClick={() => setState((previous) => ({ ...previous, showHelp: false }))}>Close Help</button>
          </div>
        </div>
      )}

      {state.phase === 'voting' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Vote Phase</div>
            <h2>Vote for the weakest link</h2>
            <p>Who hurt the chain the most? Who do you no longer trust?</p>
            <div className="chain-of-greed__vote-grid">
              {activePlayers.filter((player) => player.id !== humanPlayer?.id).map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={['chain-of-greed__vote-card', state.humanVoteTargetId === player.id ? 'chain-of-greed__vote-card--selected' : ''].filter(Boolean).join(' ')}
                  onClick={() => setState((previous) => ({ ...previous, humanVoteTargetId: player.id }))}
                >
                  <strong>{player.name}</strong>
                  <span>{player.roundContribution} secured</span>
                  <span>{player.roundBusts} busts</span>
                </button>
              ))}
            </div>
            <button type="button" className="chain-of-greed__continue" onClick={finishVoting}>Reveal Votes</button>
          </div>
        </div>
      )}

      {state.phase === 'roundIntro' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal chain-of-greed__modal--flash">
            <div className="chain-of-greed__eyebrow">Round {state.roundNumber}</div>
            <h2>Build the chain. Bank before it breaks.</h2>
            <p>{getStandardRoundEliminationCount(state.startingCount, state.roundNumber, activePlayers.length)} player{getStandardRoundEliminationCount(state.startingCount, state.roundNumber, activePlayers.length) === 1 ? '' : 's'} will be eliminated this round.</p>
            <span className="chain-of-greed__flash-caption">Round starting…</span>
          </div>
        </div>
      )}

      {state.phase === 'roundSummary' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Round {state.roundNumber} Summary</div>
            <h2>Take a moment and review the board.</h2>
            <div className="chain-of-greed__summary-grid">
              <div><span>Secured total</span><strong>{state.securedTotal.toLocaleString()}</strong></div>
              <div><span>Best contributors</span><strong>{summary.bestContributors.map((player) => player.name).join(', ') || 'None yet'}</strong></div>
              <div><span>Worst contributors</span><strong>{summary.worstContributors.map((player) => player.name).join(', ') || 'None yet'}</strong></div>
              <div><span>Most correct</span><strong>{summary.mostCorrect ? `${summary.mostCorrect.name} (${summary.mostCorrect.roundCorrectGuesses})` : '—'}</strong></div>
              <div><span>Biggest buster</span><strong>{summary.biggestBuster ? `${summary.biggestBuster.name} (${summary.biggestBuster.roundBusts})` : '—'}</strong></div>
            </div>
            <button type="button" className="chain-of-greed__continue" onClick={() => setPhase('voting', { statusText: 'Vote for the weakest link.', helperText: 'Who cost the team its momentum?' })}>Proceed to Vote</button>
          </div>
        </div>
      )}

      {state.phase === 'voteReveal' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Vote Reveal</div>
            <h2>The weakest link is not always the weakest player.</h2>
            <ul className="chain-of-greed__vote-results">
              {revealedVotes.map((vote) => (
                <li key={`${vote.voterId}-${vote.targetId}`}><strong>{vote.voterName}</strong> → {vote.targetName}</li>
              ))}
            </ul>
            {state.revealedVotes < state.pendingVotes.length && <p>Revealing votes…</p>}
          </div>
        </div>
      )}

      {state.phase === 'eliminationReveal' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Elimination</div>
            <h2>{state.eliminatedThisStep.map((id) => getPlayer(state.players, id)?.name ?? id).join(' and ')} {state.eliminatedThisStep.length === 1 ? 'is' : 'are'} out.</h2>
            {state.tieBreaks.map((tieBreak, index) => (
              <div key={`${tieBreak.type}-${index}`} className="chain-of-greed__tie-break">
                <strong>{tieBreak.message}</strong>
                <ul>{tieBreak.transcript.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            ))}
            {/* Spectator option when the human player has been eliminated */}
            {humanPlayer && state.eliminatedThisStep.includes(humanPlayer.id) && getActivePlayers(state.players).length >= 2 && (
              <div className="chain-of-greed__spectator-choice">
                <p>You've been eliminated. What would you like to do?</p>
                <div className="chain-of-greed__spectator-buttons">
                  <button
                    type="button"
                    className="chain-of-greed__continue"
                    onClick={() => {
                      setState((previous) => ({ ...previous, spectatorMode: 'watching' }));
                      continueAfterElimination();
                    }}
                  >
                    Keep watching
                  </button>
                  <button
                    type="button"
                    className="chain-of-greed__continue chain-of-greed__continue--secondary"
                    onClick={() => {
                      setState((previous) => ({ ...previous, spectatorMode: 'skipping' }));
                      continueAfterElimination();
                    }}
                  >
                    Fast watch
                  </button>
                </div>
              </div>
            )}
            {!(humanPlayer && state.eliminatedThisStep.includes(humanPlayer.id)) && (
              <button type="button" className="chain-of-greed__continue" onClick={continueAfterElimination}>
                {state.roundNumber >= STANDARD_ROUND_COUNT || getActivePlayers(state.players).length <= 2 ? 'Continue to Final' : `Continue to Round ${state.roundNumber + 1}`}
              </button>
            )}
          </div>
        </div>
      )}

      {state.phase === 'semifinalIntro' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Final 3: Sudden Chain</div>
            <h2>The chain is no longer shared.</h2>
            <p>No vote. No sympathy. Lowest semifinal score leaves. The prize pool stays at {formatInfluence(state.securedTotal)}.</p>
            <button type="button" className="chain-of-greed__continue" onClick={startSemifinal}>Start Semifinal</button>
          </div>
        </div>
      )}

      {state.phase === 'semifinalReveal' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal">
            <div className="chain-of-greed__eyebrow">Semifinal Result</div>
            <h2>{getPlayer(state.players, state.semifinalEliminatedId)?.name ?? 'A finalist'} leaves in third place.</h2>
            <div className="chain-of-greed__summary-grid">
              {Object.entries(state.semifinalScores).map(([id, score]) => (
                <div key={id}><span>{getPlayer(state.players, id)?.name ?? id}</span><strong>{score}</strong></div>
              ))}
            </div>
            {state.semifinalTieBreak && (
              <div className="chain-of-greed__tie-break">
                <strong>{state.semifinalTieBreak.message}</strong>
                <ul>{state.semifinalTieBreak.transcript.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            )}
            <button type="button" className="chain-of-greed__continue" onClick={() => setPhase('finalIntro', { statusText: 'Two players remain.', helperText: 'One player wins everything.' })}>Start Final</button>
          </div>
        </div>
      )}

      {state.phase === 'finalIntro' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal chain-of-greed__modal--hero">
            <div className="chain-of-greed__eyebrow">Round 6: LOH Final</div>
            <h2>30 seconds each. Highest chain score wins.</h2>
            <p>Every active player gets one timed chain. Ties use fewer mistakes, then fewer banks.</p>
            <button type="button" className="chain-of-greed__continue" onClick={startFinal}>Start Final</button>
          </div>
        </div>
      )}

      {state.phase === 'finalResult' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal chain-of-greed__modal--hero">
            <div className="chain-of-greed__eyebrow">Winner</div>
            <h2>{winner?.name ?? 'A finalist'} becomes LOH</h2>
            <p>Highest final score wins. Ties use fewer mistakes, then fewer banks.</p>
            <div className="chain-of-greed__summary-grid">
              {Object.entries(state.finalScores).map(([id, score]) => (
                <div key={id}><span>{getPlayer(state.players, id)?.name ?? id}</span><strong>{score}</strong></div>
              ))}
            </div>
            {state.finalTieBreak && (
              <>
                <p className="chain-of-greed__tie-brief">Scores were tied. Mistakes and bank efficiency broke the tie.</p>
                {finalDetailExpanded && (
                  <div className="chain-of-greed__tie-break">
                    <strong>{state.finalTieBreak.message}</strong>
                    <ul>{state.finalTieBreak.transcript.map((line) => <li key={line}>{line}</li>)}</ul>
                  </div>
                )}
                <button
                  type="button"
                  className="chain-of-greed__link-button"
                  onClick={() => setFinalDetailExpanded((prev) => !prev)}
                >
                  {finalDetailExpanded ? 'Hide details' : 'See details'}
                </button>
              </>
            )}
            <button type="button" className="chain-of-greed__continue" disabled={isResultCommitted} onClick={finishGame}>Claim Result</button>
          </div>
        </div>
      )}
    </div>
  );
}
