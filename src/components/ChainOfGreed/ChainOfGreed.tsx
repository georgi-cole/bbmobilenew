import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import {
  applyRoundReset,
  buildAiVoteRecords,
  buildFinalRawResults,
  CHAIN_LADDER,
  createChainOfGreedPlayers,
  createChainOfGreedRng,
  createInitialChainState,
  decideAiAction,
  FINAL_TURNS_PER_PLAYER,
  formatInfluence,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
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
  correct: '✓',
  wrong: '✕',
  bank: '◈',
  bust: '⚠',
};

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

function buildIndividualOrder(ids: string[], turnsPerPlayer: number) {
  return Array.from({ length: turnsPerPlayer }, () => ids).flat();
}

function pickHumanVoteTarget(players: ChainOfGreedPlayerState[], humanId: string | null) {
  return players.find((player) => !player.isEliminated && player.id !== humanId)?.id ?? null;
}

function getStepBadge(step: number, currentStep: number) {
  if (step === currentStep) return 'Current';
  if (step === currentStep + 1) return 'Next';
  if (step === CHAIN_LADDER.length) return 'Max';
  return null;
}

function getPlayerTurnMessage(players: ChainOfGreedPlayerState[], turnOrder: string[]) {
  const firstPlayer = getPlayer(players, turnOrder[0] ?? null);
  return `${firstPlayer?.name ?? 'Player'} to play.`;
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
  };
}

export default function ChainOfGreed(props: GenericMinigameProps) {
  const [state, setState] = useState<ChainOfGreedState>(() => buildInitialState(props));
  const [isLadderSheetOpen, setIsLadderSheetOpen] = useState(false);
  const [isInsightsSheetOpen, setIsInsightsSheetOpen] = useState(false);
  const rngRef = useRef(createChainOfGreedRng(props.seed));
  const helperIndexRef = useRef(0);
  const aiTurnLockRef = useRef<string | null>(null);
  const voteRevealLockRef = useRef<string | null>(null);

  const activePlayers = useMemo(() => getActivePlayers(state.players), [state.players]);
  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const currentTurnPlayer = useMemo(
    () => state.phase === 'playerTurn' ? getPlayer(state.players, state.turnOrder[state.turnIndex] ?? null) : null,
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

  function nextHelper(pool: string[]) {
    helperIndexRef.current += 1;
    return pool[helperIndexRef.current % pool.length] ?? pool[0] ?? '';
  }

  function setPhase(phase: Phase, partial: Partial<ChainOfGreedState> = {}) {
    setState((previous) => ({ ...previous, phase, ...partial }));
  }

  function startRound(roundNumber: number, players = state.players) {
    const nextPlayers = players.map((player) => player.isEliminated ? player : applyRoundReset(player));
    const livePlayers = getActivePlayers(nextPlayers);
    const nextChain = createInitialChainState(rngRef.current.rng);
    const turnOrder = rotateOrder(livePlayers.map((player) => player.id), roundNumber - 1);
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

  const resolveStandardAction = useCallback((actorId: string, choice: ChainAction) => {
    const actor = getPlayer(state.players, actorId);
    if (!actor) return;
    const resolution = resolveChainAction(choice, state.chain, rngRef.current.rng);
    const nextPlayers: ChainOfGreedPlayerState[] = state.players.map((player) => {
      if (player.id !== actorId) return player;
      const latestMoment: ChainOfGreedPlayerState['latestMoment'] = choice === 'bank'
        ? 'bank'
        : resolution.wasCorrect
          ? 'correct'
          : resolution.busted
            ? 'bust'
            : 'wrong';
      return {
        ...player,
        turnsTakenThisRound: player.turnsTakenThisRound + 1,
        roundContribution: player.roundContribution + resolution.securedDelta,
        totalContribution: player.totalContribution + resolution.securedDelta,
        roundCorrectGuesses: player.roundCorrectGuesses + (resolution.wasCorrect ? 1 : 0),
        totalCorrectGuesses: player.totalCorrectGuesses + (resolution.wasCorrect ? 1 : 0),
        roundWrongGuesses: player.roundWrongGuesses + (resolution.wasCorrect === false ? 1 : 0),
        totalWrongGuesses: player.totalWrongGuesses + (resolution.wasCorrect === false ? 1 : 0),
        roundBanks: player.roundBanks + (choice === 'bank' ? 1 : 0),
        totalBanks: player.totalBanks + (choice === 'bank' ? 1 : 0),
        roundBusts: player.roundBusts + (resolution.busted ? 1 : 0),
        totalBusts: player.totalBusts + (resolution.busted ? 1 : 0),
        latestMoment,
      };
    });
    const message = choice === 'bank'
      ? `${actor.name} banks ${resolution.securedDelta || 0}. ${resolution.message}`
      : `${actor.name} calls ${choice}. ${resolution.message}`;
    const nextHistory: ChainOfGreedTurnRecord[] = [{
      actorId,
      actorName: actor.name,
      choice,
      referenceNumber: state.chain.referenceNumber,
      revealedNumber: resolution.revealedNumber,
      wasCorrect: resolution.wasCorrect,
      bankedAmount: resolution.securedDelta,
      lostAmount: resolution.lostAmount,
      message,
      phase: 'standard' as const,
    }, ...state.turnHistory].slice(0, 10);
    if (choice === 'bank' && resolution.securedDelta > 0) emitSoundCue('bank-secure-chime');
    if (resolution.wasCorrect) emitSoundCue('correct-guess-tick');
    if (resolution.wasCorrect === false) emitSoundCue('bust-impact');

    const nextTurnsRemaining = state.turnsRemaining - 1;
    if (nextTurnsRemaining <= 0) {
      setState((previous) => ({
        ...previous,
        players: nextPlayers,
        chain: resolution.updatedChain,
        phase: 'roundSummary',
        roundSecured: previous.roundSecured + resolution.securedDelta,
        securedTotal: previous.securedTotal + resolution.securedDelta,
        turnHistory: nextHistory,
        revealedNumber: resolution.revealedNumber,
        statusText: 'Take a moment and review the board.',
        helperText: 'Performance matters, but house feelings matter too.',
      }));
      return;
    }

    setState((previous) => ({
      ...previous,
      players: nextPlayers,
      chain: resolution.updatedChain,
      phase: 'playerTurn',
      turnIndex: previous.turnIndex + 1,
      turnsRemaining: nextTurnsRemaining,
      roundSecured: previous.roundSecured + resolution.securedDelta,
      securedTotal: previous.securedTotal + resolution.securedDelta,
      turnHistory: nextHistory,
      revealedNumber: resolution.revealedNumber,
      statusText: message,
      helperText: nextHelper(TURN_HELPERS),
    }));
  }, [state]);

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

  const resolveIndividualAction = useCallback((kind: 'semifinal' | 'final', actorId: string, choice: ChainAction) => {
    const actor = getPlayer(state.players, actorId);
    const chainMap = kind === 'semifinal' ? state.semifinalChains : state.finalChains;
    const scoreMap = kind === 'semifinal' ? state.semifinalScores : state.finalScores;
    const turnIndex = kind === 'semifinal' ? state.semifinalTurnIndex : state.finalTurnIndex;
    const order = kind === 'semifinal' ? state.semifinalOrder : state.finalOrder;
    const actorChain = chainMap[actorId];
    if (!actor || !actorChain) return;

    const resolution = resolveChainAction(choice, actorChain, rngRef.current.rng);
    const nextChains = { ...chainMap, [actorId]: resolution.updatedChain };
    const nextScores = { ...scoreMap, [actorId]: (scoreMap[actorId] ?? 0) + resolution.individualDelta };
    const nextPlayers = state.players.map((player) => {
      if (player.id !== actorId) return player;
      return kind === 'semifinal'
        ? { ...player, semifinalScore: nextScores[actorId] ?? 0 }
        : { ...player, finalScore: nextScores[actorId] ?? 0 };
    });

    const nextHistory: ChainOfGreedTurnRecord[] = [{
      actorId,
      actorName: actor.name,
      choice,
      referenceNumber: actorChain.referenceNumber,
      revealedNumber: resolution.revealedNumber,
      wasCorrect: resolution.wasCorrect,
      bankedAmount: resolution.individualDelta,
      lostAmount: resolution.lostAmount,
      message: `${actor.name} ${choice === 'bank' ? 'banks' : `calls ${choice}`}. ${resolution.message}`,
      phase: kind,
    }, ...state.turnHistory].slice(0, 10);

    const nextTurnIndex = turnIndex + 1;
    if (nextTurnIndex >= order.length) {
      if (kind === 'semifinal') {
        const invertedScores = Object.fromEntries(Object.entries(nextScores).map(([id, score]) => [id, -score]));
        const ranking = rankPlayersByScore(invertedScores, nextPlayers, rngRef.current.rng);
        const eliminated = ranking.ordered[0] ?? null;
        emitSoundCue('elimination-sting');
        setState((previous) => ({
          ...previous,
          players: nextPlayers.map((player) => player.id === eliminated?.id ? { ...player, isEliminated: true } : player),
          phase: 'semifinalReveal',
          semifinalScores: nextScores,
          semifinalChains: nextChains,
          semifinalTieBreak: ranking.tieBreak,
          semifinalEliminatedId: eliminated?.id ?? null,
          turnHistory: nextHistory,
          revealedNumber: resolution.revealedNumber,
          statusText: eliminated ? `${eliminated.name} leaves in third place.` : 'Semifinal complete.',
          helperText: 'Only two remain.',
        }));
        return;
      }

      const ranking = rankPlayersByScore(nextScores, nextPlayers, rngRef.current.rng);
      emitSoundCue('winner-stinger');
      setState((previous) => ({
        ...previous,
        players: nextPlayers,
        phase: 'finalResult',
        finalScores: nextScores,
        finalChains: nextChains,
        finalTieBreak: ranking.tieBreak,
        winnerId: ranking.ordered[0]?.id ?? null,
        turnHistory: nextHistory,
        revealedNumber: resolution.revealedNumber,
        statusText: `${ranking.ordered[0]?.name ?? 'A finalist'} wins everything.`,
        helperText: 'Only one player can claim the influence.',
      }));
      return;
    }

    setState((previous) => ({
      ...previous,
      players: nextPlayers,
      turnHistory: nextHistory,
      revealedNumber: resolution.revealedNumber,
      statusText: `${actor.name} ${choice === 'bank' ? 'banks' : `calls ${choice}`}. ${resolution.message}`,
      helperText: nextHelper(FINAL_HELPERS),
      ...(kind === 'semifinal'
        ? { semifinalScores: nextScores, semifinalChains: nextChains, semifinalTurnIndex: nextTurnIndex }
        : { finalScores: nextScores, finalChains: nextChains, finalTurnIndex: nextTurnIndex }),
    }));
  }, [state]);

  function startSemifinal() {
    const finalists = getActivePlayers(state.players);
    const ids = finalists.map((player) => player.id);
    const order = buildIndividualOrder(ids, SEMIFINAL_TURNS_PER_PLAYER);
    const chains = Object.fromEntries(ids.map((id) => [id, createInitialChainState(rngRef.current.rng)]));
    const scores = Object.fromEntries(ids.map((id) => [id, 0]));
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
    const order = buildIndividualOrder(ids, FINAL_TURNS_PER_PLAYER);
    const chains = Object.fromEntries(ids.map((id) => [id, createInitialChainState(rngRef.current.rng)]));
    const scores = Object.fromEntries(ids.map((id) => [id, 0]));
    emitSoundCue('final-showdown-sting');
    setState((previous) => ({
      ...previous,
      phase: 'finalTurn',
      finalOrder: order,
      finalTurnIndex: 0,
      finalScores: scores,
      finalChains: chains,
      finalTieBreak: null,
      statusText: 'Final Showdown. One last chain.',
      helperText: nextHelper(FINAL_HELPERS),
      revealedNumber: Object.values(chains)[0]?.referenceNumber ?? null,
    }));
  }

  function continueAfterElimination() {
    const remaining = getActivePlayers(state.players);
    if (remaining.length === 3) {
      setPhase('semifinalIntro', {
        statusText: 'Final 3: Sudden Chain. No team vote. No sympathy.',
        helperText: 'Lowest score leaves. Two remain.',
      });
      return;
    }
    startRound(state.roundNumber + 1, state.players);
  }

  function finishGame() {
    const winnerId = state.winnerId ?? activePlayers[0]?.id ?? humanPlayer?.id ?? null;
    if (!winnerId) return;
    const rawResults = buildFinalRawResults(state.players, winnerId, state.securedTotal);
    props.onFinish?.(rawResults[humanPlayer?.id ?? winnerId] ?? state.securedTotal, undefined, {
      authoritativeWinnerId: winnerId,
      rawValue: rawResults[humanPlayer?.id ?? winnerId] ?? state.securedTotal,
      rawResults,
    });
  }

  useEffect(() => {
    if (state.phase !== 'playerTurn' || !currentTurnPlayer || currentTurnPlayer.isHuman) return;
    const lockKey = `${state.roundNumber}:${state.turnIndex}:${currentTurnPlayer.id}`;
    if (aiTurnLockRef.current === lockKey) return;
    aiTurnLockRef.current = lockKey;
    const timer = window.setTimeout(() => {
      resolveStandardAction(currentTurnPlayer.id, decideAiAction({
        player: currentTurnPlayer,
        chain: state.chain,
        remainingTurns: state.turnsRemaining,
        phase: 'standard',
        activePlayers,
      }));
    }, 480 + Math.round(rngRef.current.rng() * 420));
    return () => window.clearTimeout(timer);
  }, [activePlayers, currentTurnPlayer, resolveStandardAction, state.chain, state.phase, state.roundNumber, state.turnIndex, state.turnsRemaining]);

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
    const timer = window.setTimeout(() => {
      setPhase('playerTurn', {
        statusText: getPlayerTurnMessage(state.players, state.turnOrder),
        helperText: nextHelper(TURN_HELPERS),
      });
    }, 950);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.players, state.turnOrder]);

  useEffect(() => {
    if (state.phase !== 'semifinalTurn' || !semifinalPlayer || semifinalPlayer.isHuman) return;
    const timer = window.setTimeout(() => {
      const turnsUsed = state.semifinalOrder.slice(0, state.semifinalTurnIndex + 1).filter((id) => id === semifinalPlayer.id).length;
      resolveIndividualAction('semifinal', semifinalPlayer.id, decideAiAction({
        player: semifinalPlayer,
        chain: state.semifinalChains[semifinalPlayer.id],
        remainingTurns: SEMIFINAL_TURNS_PER_PLAYER - turnsUsed + 1,
        phase: 'semifinal',
        activePlayers,
        playerScore: state.semifinalScores[semifinalPlayer.id] ?? 0,
      }));
    }, 500 + Math.round(rngRef.current.rng() * 280));
    return () => window.clearTimeout(timer);
  }, [activePlayers, resolveIndividualAction, semifinalPlayer, state.phase, state.semifinalChains, state.semifinalOrder, state.semifinalScores, state.semifinalTurnIndex]);

  useEffect(() => {
    if (state.phase !== 'finalTurn' || !finalPlayer || finalPlayer.isHuman) return;
    const timer = window.setTimeout(() => {
      const turnsUsed = state.finalOrder.slice(0, state.finalTurnIndex + 1).filter((id) => id === finalPlayer.id).length;
      resolveIndividualAction('final', finalPlayer.id, decideAiAction({
        player: finalPlayer,
        chain: state.finalChains[finalPlayer.id],
        remainingTurns: FINAL_TURNS_PER_PLAYER - turnsUsed + 1,
        phase: 'final',
        activePlayers,
        playerScore: state.finalScores[finalPlayer.id] ?? 0,
      }));
    }, 500 + Math.round(rngRef.current.rng() * 280));
    return () => window.clearTimeout(timer);
  }, [activePlayers, finalPlayer, resolveIndividualAction, state.finalChains, state.finalOrder, state.finalScores, state.finalTurnIndex, state.phase]);

  const referenceNumber = state.phase === 'semifinalTurn'
    ? (semifinalPlayer ? state.semifinalChains[semifinalPlayer.id]?.referenceNumber : 0)
    : state.phase === 'finalTurn'
      ? (finalPlayer ? state.finalChains[finalPlayer.id]?.referenceNumber : 0)
      : state.chain.referenceNumber;
  const activeStep = state.phase === 'semifinalTurn'
    ? (semifinalPlayer ? state.semifinalChains[semifinalPlayer.id]?.step : 0)
    : state.phase === 'finalTurn'
      ? (finalPlayer ? state.finalChains[finalPlayer.id]?.step : 0)
      : state.chain.step;
  const activePot = state.phase === 'semifinalTurn'
    ? (semifinalPlayer ? state.semifinalChains[semifinalPlayer.id]?.pot : 0)
    : state.phase === 'finalTurn'
      ? (finalPlayer ? state.finalChains[finalPlayer.id]?.pot : 0)
      : state.chain.pot;
  const revealedVotes = state.pendingVotes.slice(0, state.revealedVotes);
  const winner = getPlayer(state.players, state.winnerId);
  const standardTurnLabels = state.phase === 'playerTurn' && currentTurnPlayer?.isHuman;
  const semifinalTurnLabels = state.phase === 'semifinalTurn' && semifinalPlayer?.isHuman;
  const finalTurnLabels = state.phase === 'finalTurn' && finalPlayer?.isHuman;
  const currentActor = currentTurnPlayer ?? semifinalPlayer ?? finalPlayer;
  const isHumanTurn = Boolean(standardTurnLabels || semifinalTurnLabels || finalTurnLabels);
  const showStickyActionBar = state.phase === 'playerTurn' || state.phase === 'semifinalTurn' || state.phase === 'finalTurn';
  const currentChainStep = activeStep || 0;
  const nextReward = CHAIN_LADDER[Math.min(currentChainStep, CHAIN_LADDER.length - 1)] ?? CHAIN_LADDER[CHAIN_LADDER.length - 1];
  const currentPotLabel = activePot > 0 ? activePot.toLocaleString() : '0';
  const isAtStartingPosition = currentChainStep === 0;
  const referenceRungIndex = currentChainStep === 0 ? 1 : currentChainStep;
  const lockedRewardValue = currentChainStep > 0 ? CHAIN_LADDER[currentChainStep - 1] : null;
  const nextRewardValueLabel = nextReward.toLocaleString();
  const chainStatusText = {
    step: `Step ${currentChainStep}/${CHAIN_LADDER.length}`,
    pot: `Pot ${currentPotLabel}`,
    next: `Next ${nextRewardValueLabel}`,
  };
  const chainStatusAriaLabel = `Step ${currentChainStep} of ${CHAIN_LADDER.length}, pot ${currentPotLabel}, next reward ${nextReward.toLocaleString()}`;
  const ladderSteps = [...CHAIN_LADDER].reverse().map((value, index) => {
    const step = CHAIN_LADDER.length - index;
    return {
      value,
      step,
      badge: getStepBadge(step, currentChainStep),
      isActive: currentChainStep === step,
      isCleared: currentChainStep > step,
      isNext: currentChainStep + 1 === step,
      carriesReference: !isAtStartingPosition && step === referenceRungIndex,
      tension: step >= 7 ? 'danger' : step >= 4 ? 'surge' : 'base',
    };
  });
  const lastTurn = state.turnHistory[0] ?? null;
  const heroKicker = isHumanTurn
    ? 'YOUR TURN'
    : currentActor
      ? `${currentActor.name.toUpperCase()} IS THINKING`
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
  const heroCommentary = lastTurn?.message ?? state.statusText;
  const heroTone = lastTurn?.message?.toLowerCase().includes('wrong') || lastTurn?.message?.toLowerCase().includes('lost') || lastTurn?.message?.toLowerCase().includes('miss')
    ? 'danger'
    : lastTurn?.choice === 'bank'
      ? 'bank'
      : lastTurn?.wasCorrect
        ? 'success'
        : 'neutral';
  const heroPrompt = isHumanTurn
    ? activePot > 0
      ? `Do you bank ${activePot.toLocaleString()} or push the chain?`
      : 'Open the chain carefully. A miss destroys the active pot.'
    : currentActor
      ? `${currentActor.name} is weighing the risk.`
      : state.helperText;
  const nextRewardCopy = currentChainStep >= CHAIN_LADDER.length
    ? 'The full chain is lit.'
    : currentChainStep === 0
      ? `First correct call starts the climb at ${nextReward.toLocaleString()}.`
      : `One more hit reaches ${nextReward.toLocaleString()}.`;
  const actionHint = isHumanTurn
    ? activePot > 0
      ? `A miss destroys ${activePot.toLocaleString()}. Banking secures it now.`
      : 'Bank is safe, but the first correct guess starts the value.'
    : `Waiting for ${currentActor?.name ?? 'the house'}…`;
  const playerMetricText = (player: ChainOfGreedPlayerState) => {
    if (state.phase === 'finalTurn' || state.phase === 'finalResult') return `${player.finalScore} final`;
    if (state.phase === 'semifinalTurn' || state.phase === 'semifinalReveal') return `${player.semifinalScore} semi`;
    return `${player.totalContribution} secured`;
  };
  const actionTargetId = currentActor?.id ?? null;
  const actionTargetKind = state.phase === 'playerTurn'
    ? 'standard'
    : state.phase === 'semifinalTurn'
      ? 'semifinal'
      : state.phase === 'finalTurn'
        ? 'final'
        : null;
  const handleAction = (choice: ChainAction) => {
    if (!actionTargetId || !actionTargetKind) return;
    if (actionTargetKind === 'standard') {
      resolveStandardAction(actionTargetId, choice);
      return;
    }
    resolveIndividualAction(actionTargetKind, actionTargetId, choice);
  };

  return (
    <div className="chain-of-greed" data-testid="chain-of-greed">
      <div className="chain-of-greed__backdrop" />
      <div className="chain-of-greed__shell">
        <header className="chain-of-greed__header">
          <div className="chain-of-greed__title-group">
            <div className="chain-of-greed__eyebrow">
              {state.phase.startsWith('final')
                ? 'Final 2'
                : state.phase.startsWith('semifinal')
                  ? 'Final 3'
                  : `Round ${state.roundNumber}`}
            </div>
            <h1>Chain of Greed</h1>
          </div>
          <div className="chain-of-greed__hud">
            <div className="chain-of-greed__chip">
              <span>Remaining</span>
              <strong>{activePlayers.length}</strong>
            </div>
            <div className="chain-of-greed__chip chain-of-greed__chip--gold">
              <span>Secured</span>
              <strong>{state.securedTotal.toLocaleString()}</strong>
            </div>
            <button
              type="button"
              className="chain-of-greed__help-button chain-of-greed__help-button--icon"
              aria-label="Open help"
              onClick={() => setState((previous) => ({ ...previous, showHelp: !previous.showHelp }))}
            >
              <span className="chain-of-greed__help-icon" aria-hidden="true">?</span>
              <span>Help</span>
            </button>
          </div>
        </header>

        {showStickyActionBar && (
          <motion.footer
            className="chain-of-greed__action-bar"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24 }}
          >
            <div className="chain-of-greed__action-bar-copy">
              <span className="chain-of-greed__panel-title">{isHumanTurn ? 'Choose your move' : 'Waiting for AI'}</span>
              <p>{actionHint}</p>
            </div>
            {isHumanTurn ? (
              <div className="chain-of-greed__buttons">
                <button type="button" className="chain-of-greed__action chain-of-greed__action--lower" onClick={() => handleAction('lower')}>Lower</button>
                <button type="button" className="chain-of-greed__action chain-of-greed__action--bank" onClick={() => handleAction('bank')}>Bank</button>
                <button type="button" className="chain-of-greed__action chain-of-greed__action--higher" onClick={() => handleAction('higher')}>Higher</button>
              </div>
            ) : (
              <div className="chain-of-greed__ai-waiting">
                <strong>{currentActor?.name ?? 'The house'}</strong>
                <span>is reading the board…</span>
              </div>
            )}
          </motion.footer>
        )}

        <main className="chain-of-greed__main">
          <section className="chain-of-greed__rail-section">
            <div className="chain-of-greed__rail-heading">
              <span className="chain-of-greed__panel-title">Player rail</span>
              <span>{currentActor ? `${currentActor.name} highlighted` : 'Track the house'}</span>
            </div>
            <div className="chain-of-greed__player-rail" data-testid="chain-player-rail">
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
                  >
                    <div className="chain-of-greed__rail-avatar">{player.avatar}</div>
                    <div className="chain-of-greed__rail-copy">
                      <strong>{player.name}</strong>
                      <span>{playerMetricText(player)}</span>
                    </div>
                    <span className="chain-of-greed__rail-badge">{player.isEliminated ? 'OUT' : latestMoment}</span>
                  </article>
                );
              })}
            </div>
          </section>

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
            <div className="chain-of-greed__hero-topline">
              <span className="chain-of-greed__status-kicker">{heroKicker}</span>
              <span className="chain-of-greed__phase-chip">{heroPhaseChip}</span>
            </div>
            <p className="chain-of-greed__commentary">{heroCommentary}</p>
            <div className="chain-of-greed__stage-core">
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
              <button
                type="button"
                className="chain-of-greed__ladder-stage"
                data-testid="chain-ladder-stage"
                onClick={() => setIsLadderSheetOpen(true)}
              >
                <div className={`chain-of-greed__number-aura chain-of-greed__number-aura--${heroTone}`} aria-hidden="true" />
                <ol className="chain-of-greed__ladder-track" aria-label="Current chain ladder">
                  {ladderSteps.map(({ value, step, badge, isActive, isCleared, isNext, carriesReference, tension }) => (
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
                      <span className="chain-of-greed__ladder-step-copy">
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
                            <span className="chain-of-greed__ladder-detail chain-of-greed__ladder-detail--pot">
                              Current pot {currentPotLabel}
                            </span>
                          </span>
                        )}
                        {isNext && (
                          <span className="chain-of-greed__next-cluster">
                            <span className="chain-of-greed__next-badge">Next</span>
                            <span className="chain-of-greed__ladder-detail chain-of-greed__ladder-detail--next">
                              {nextRewardValueLabel}
                            </span>
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
                        <span className="chain-of-greed__ladder-detail chain-of-greed__ladder-detail--pot">
                          Current pot {currentPotLabel}
                        </span>
                      </span>
                    </span>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {state.revealedNumber !== null && state.revealedNumber !== referenceNumber && (
                    <motion.div
                      className={`chain-of-greed__reveal chain-of-greed__reveal--${heroTone}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      Next reveal <strong>{state.revealedNumber}</strong>
                    </motion.div>
                  )}
                </AnimatePresence>
                <span className="chain-of-greed__ladder-tap">View full ladder</span>
              </button>
            </div>
            <div className="chain-of-greed__hero-status">
              <div className="chain-of-greed__inline-status" data-testid="chain-inline-status">
                <span aria-label={`Step ${currentChainStep} of ${CHAIN_LADDER.length}`}>{chainStatusText.step}</span>
                <span aria-label={`Pot ${currentPotLabel}`}>{chainStatusText.pot}</span>
                <span aria-label={`Next reward ${nextReward.toLocaleString()}`}>{chainStatusText.next}</span>
              </div>
              <p className="chain-of-greed__prompt">{heroPrompt}</p>
              <p className="chain-of-greed__reward-line">
                {lockedRewardValue !== null
                  ? `${lockedRewardValue.toLocaleString()} locked in on the current rung.`
                  : nextRewardCopy}
              </p>
            </div>
            <div className="chain-of-greed__stage-footer" aria-label={chainStatusAriaLabel}>
              <span>{chainStatusText.step} • {chainStatusText.pot} • {chainStatusText.next}</span>
            </div>
          </motion.section>

          <section className="chain-of-greed__utility-stack">
            <button type="button" className="chain-of-greed__preview-card chain-of-greed__preview-card--secondary" onClick={() => setIsInsightsSheetOpen(true)}>
              <div className="chain-of-greed__preview-topline">
                <span className="chain-of-greed__panel-title">Round details</span>
                <span className="chain-of-greed__preview-link">Open insights</span>
              </div>
              <div className="chain-of-greed__preview-stats">
                <div>
                  <span>Round bank</span>
                  <strong>{state.roundSecured.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Best</span>
                  <strong>{summary.bestContributors[0]?.name ?? '—'}</strong>
                </div>
                <div>
                  <span>Weakest</span>
                  <strong>{summary.worstContributors[0]?.name ?? '—'}</strong>
                </div>
              </div>
            </button>
          </section>
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
                  {state.turnHistory.slice(0, 5).map((entry) => (
                    <li key={`${entry.actorId}-${entry.referenceNumber}-${entry.choice}-${entry.revealedNumber}`}>
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
              <li>Standard rounds end with a weakest-link vote. Final 3 and Final 2 use individual scoring.</li>
              <li>Only the final winner claims the secured influence total. Everyone else gets 0.</li>
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
            <button type="button" className="chain-of-greed__continue" onClick={continueAfterElimination}>
              {getActivePlayers(state.players).length === 3 ? 'Continue to Final 3' : `Continue to Round ${state.roundNumber + 1}`}
            </button>
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
            <div className="chain-of-greed__eyebrow">Final 2: Chain Showdown</div>
            <h2>One last chain.</h2>
            <p>Four turns each. Fixed turns. Sudden death only if the scores are tied. Winner claims {formatInfluence(state.securedTotal)}.</p>
            <button type="button" className="chain-of-greed__continue" onClick={startFinal}>Start Final</button>
          </div>
        </div>
      )}

      {state.phase === 'finalResult' && (
        <div className="chain-of-greed__overlay">
          <div className="chain-of-greed__modal chain-of-greed__modal--hero">
            <div className="chain-of-greed__eyebrow">Winner</div>
            <h2>{winner?.name ?? 'A finalist'} claims {formatInfluence(state.securedTotal)}</h2>
            <p>All other players leave with nothing.</p>
            <div className="chain-of-greed__summary-grid">
              {Object.entries(state.finalScores).map(([id, score]) => (
                <div key={id}><span>{getPlayer(state.players, id)?.name ?? id}</span><strong>{score}</strong></div>
              ))}
            </div>
            {state.finalTieBreak && (
              <div className="chain-of-greed__tie-break">
                <strong>{state.finalTieBreak.message}</strong>
                <ul>{state.finalTieBreak.transcript.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            )}
            <button type="button" className="chain-of-greed__continue" onClick={finishGame}>Claim Result</button>
          </div>
        </div>
      )}
    </div>
  );
}
