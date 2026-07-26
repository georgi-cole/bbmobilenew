import { useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { mulberry32 } from '../../store/rng';
import BigSpenderBoard, {
  type BigSpenderLatestReveal,
  type BigSpenderWallMotif,
  type BigSpenderWallTransitionStage,
} from './BigSpenderBoard';
import BigSpenderOverlays, { type BigSpenderBombDramaStage } from './BigSpenderOverlays';
import {
  BIG_SPENDER_CONFIG,
  buildBigSpenderRawResults,
  continueBigSpenderRound,
  createInitialBigSpenderState,
  decideAiShouldOpen,
  fastForwardBigSpenderGame,
  getAiActionDelayMs,
  getBigSpenderBoardForPlayer,
  lockBigSpenderPlayer,
  openBigSpenderWallet,
  rankBigSpenderGame,
  rankBigSpenderPlayers,
  resolveBigSpenderAdRescue,
  resolveBigSpenderParticipants,
  skipBigSpenderToResults,
  type BigSpenderState,
  type BigSpenderWallet,
} from './bigSpenderLogic';
import './BigSpender.css';
import './BigSpenderModern.css';
import './BigSpenderWall.css';

const BOMB_IMPACT_MS = 760;
const BOMB_PROMPT_MS = 2200;
const ZERO_RESULTS_DELAY_MS = 2600;
const WINNER_CELEBRATION_MS = 1900;
const WALL_SIZE = 16;
const LATEST_REVEAL_MS = 2400;
const WALL_CLEAR_MS = 360;
const WALL_TRANSITION_MS = 860;

function getBalanceZone(balance: number) {
  if (balance === 0) return { label: 'Perfect landing', tone: 'perfect' };
  if (balance <= 150) return { label: 'Red-hot range', tone: 'hot' };
  if (balance <= 500) return { label: 'Competitive range', tone: 'competitive' };
  if (balance <= 900) return { label: 'Still expensive', tone: 'high' };
  return { label: 'Big spender territory', tone: 'very-high' };
}

function getBalanceAfterOutcome(balance: number, outcome: BigSpenderWallet['outcome']) {
  if (outcome.type === 'bomb') return balance;
  return Math.max(0, balance + (outcome.amount ?? 0));
}

function chooseAiWallet(state: BigSpenderState, playerId: string, rng: () => number) {
  const board = getBigSpenderBoardForPlayer(state, playerId);
  const firstWall = board.slice(0, WALL_SIZE);
  const activeWall = firstWall.some((wallet) => wallet.state === 'hidden')
    ? firstWall
    : board.slice(WALL_SIZE, WALL_SIZE * 2);
  const available = activeWall.filter((wallet) => wallet.state === 'hidden');
  return available[Math.floor(rng() * available.length)] ?? available[0] ?? null;
}

function isBroadcastEvent(event: BigSpenderState['events'][number]) {
  return (
    event.type === 'playerLocked' ||
    event.type === 'playerBombed' ||
    event.type === 'playerZeroFinished' ||
    event.type === 'playerEliminated' ||
    event.type === 'roundCompleted'
  );
}

function getBroadcastKey(event: BigSpenderState['events'][number]) {
  return `${event.type}:${event.playerId ?? 'house'}:${event.walletId ?? ''}:${event.message}`;
}

export default function BigSpenderReplenishing(props: GenericMinigameProps) {
  const participants = useMemo(
    () => resolveBigSpenderParticipants(props.participants, props.participantIds),
    [props.participants, props.participantIds],
  );
  const seed = props.seed || 73_337;
  const [state, setState] = useState(() => createInitialBigSpenderState(participants, seed));
  const [resultCommitted, setResultCommitted] = useState(false);
  const [broadcasts, setBroadcasts] = useState<string[]>([]);
  const [bombDramaStage, setBombDramaStage] = useState<BigSpenderBombDramaStage>(null);
  const [zeroDramaVisible, setZeroDramaVisible] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fastForwarding, setFastForwarding] = useState(false);
  const [latestReveal, setLatestReveal] = useState<BigSpenderLatestReveal | null>(null);
  const [latestRevealVisible, setLatestRevealVisible] = useState(false);
  const [wallView, setWallView] = useState(() => ({ roundNumber: state.roundNumber, index: 0 }));
  const [wallTransitionStage, setWallTransitionStage] = useState<BigSpenderWallTransitionStage>(null);

  const aiRngRef = useRef(mulberry32((seed ^ 0x5eedcafe) >>> 0));
  const aiTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const broadcastQueueRef = useRef<string[]>([]);
  const broadcastKeysRef = useRef(new Set<string>());
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeroDramaKeysRef = useRef(new Set<string>());
  const latestRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wallTransitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wallTransitionRunningRef = useRef(false);

  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const humanBoard = useMemo(
    () => (humanPlayer ? getBigSpenderBoardForPlayer(state, humanPlayer.playerId) : state.board),
    [humanPlayer, state],
  );
  const ranking = useMemo(
    () =>
      state.status === 'completed'
        ? rankBigSpenderGame(state)
        : rankBigSpenderPlayers(state.players.filter((player) => state.activePlayerIds.includes(player.playerId))),
    [state],
  );
  const winner = ranking[0] ?? null;
  const isFinaleRound = state.roundNumber === BIG_SPENDER_CONFIG.finalRound;
  const finalePlayers = useMemo(
    () => state.players.filter((player) => state.activePlayerIds.includes(player.playerId)),
    [state.activePlayerIds, state.players],
  );
  const humanInRound = Boolean(humanPlayer && state.activePlayerIds.includes(humanPlayer.playerId));
  const humanAdRescuePending = Boolean(state.pendingAdRescue && humanPlayer?.playerId === state.pendingAdRescue.playerId);
  const humanSecondChancePending = Boolean(
    state.pendingSecondChance && humanPlayer?.playerId === state.pendingSecondChance.playerId,
  );
  const pendingAdRescueWalletId = state.pendingAdRescue?.walletId ?? null;
  const humanFinaleTurn = Boolean(!isFinaleRound || (humanPlayer && state.currentTurnPlayerId === humanPlayer.playerId));
  const humanFinishedWhileRunning = Boolean(
    state.status === 'running' &&
      humanPlayer &&
      (!humanInRound || humanPlayer.finalizedAt != null || humanPlayer.status !== 'active'),
  );
  const humanWaitingForFinaleTurn = Boolean(
    state.status === 'running' &&
      humanPlayer &&
      humanInRound &&
      isFinaleRound &&
      humanPlayer.status === 'active' &&
      state.currentTurnPlayerId !== humanPlayer.playerId,
  );
  const canHumanOpen = Boolean(
    humanPlayer &&
      humanInRound &&
      humanPlayer.status === 'active' &&
      state.status === 'running' &&
      humanFinaleTurn &&
      !humanAdRescuePending &&
      (!state.pendingSecondChance || humanSecondChancePending),
  );
  const canHumanLock = Boolean(
    canHumanOpen &&
      !humanSecondChancePending &&
      humanPlayer &&
      humanPlayer.walletsOpened >= BIG_SPENDER_CONFIG.minWalletsBeforeLock,
  );
  const walletsUntilLock = Math.max(0, BIG_SPENDER_CONFIG.minWalletsBeforeLock - (humanPlayer?.walletsOpened ?? 0));

  const effectiveWallIndex = wallView.roundNumber === state.roundNumber ? wallView.index : 0;
  const firstWallWallets = humanBoard.slice(0, WALL_SIZE);
  const firstWallExhausted =
    firstWallWallets.length === WALL_SIZE && firstWallWallets.every((wallet) => wallet.state === 'revealed');
  const hasFreshWall = humanBoard.slice(WALL_SIZE, WALL_SIZE * 2).some((wallet) => wallet.state === 'hidden');
  const wallStartIndex = effectiveWallIndex * WALL_SIZE;
  const visibleWallets = humanBoard.slice(wallStartIndex, wallStartIndex + WALL_SIZE);
  const visibleWallOpened = visibleWallets.filter((wallet) => wallet.state === 'revealed').length;
  const visibleWallClosed = visibleWallets.length - visibleWallOpened;
  const firstWallMotif: BigSpenderWallMotif = state.roundNumber % 2 === 0 ? 'diamond' : 'vault';
  const visibleWallMotif: BigSpenderWallMotif =
    effectiveWallIndex === 0 ? firstWallMotif : firstWallMotif === 'vault' ? 'diamond' : 'vault';
  const balanceZone = getBalanceZone(humanPlayer?.balance ?? BIG_SPENDER_CONFIG.startingBalance);
  const displayedLatestReveal =
    latestRevealVisible && latestReveal?.roundNumber === state.roundNumber ? latestReveal : null;
  const humanZeroFinished = humanPlayer?.status === 'zeroFinished';
  const humanZeroEvent = humanPlayer
    ? state.events.find((event) => event.type === 'playerZeroFinished' && event.playerId === humanPlayer.playerId)
    : null;
  const humanZeroEventKey = humanZeroEvent ? getBroadcastKey(humanZeroEvent) : null;
  const latestRoundResult = state.roundResults[state.roundResults.length - 1] ?? null;
  const shouldShowRoundSummary = state.status === 'roundSummary' && latestRoundResult != null;
  const roundSummaryPlayers = useMemo(() => {
    if (!latestRoundResult) return [];
    const ids = new Set(latestRoundResult.rankedPlayerIds);
    return rankBigSpenderPlayers(state.players.filter((player) => ids.has(player.playerId)));
  }, [latestRoundResult, state.players]);
  const humanEliminatedInSummary = Boolean(
    shouldShowRoundSummary && humanPlayer && latestRoundResult?.eliminatedPlayerIds.includes(humanPlayer.playerId),
  );
  const shouldShowResults = state.status === 'completed' && showResults;
  const winnerCelebrationVisible = Boolean(
    state.status === 'completed' && winner && !showResults && !zeroDramaVisible,
  );

  useEffect(() => {
    const timers = aiTimersRef.current;
    for (const [playerId, timer] of timers) {
      const player = state.players.find((entry) => entry.playerId === playerId);
      if (state.status !== 'running' || !player || player.isHuman || player.status !== 'active') {
        clearTimeout(timer);
        timers.delete(playerId);
      }
    }

    if (state.status !== 'running') return;

    for (const player of state.players) {
      if (player.isHuman || player.status !== 'active' || timers.has(player.playerId)) continue;
      if (!state.activePlayerIds.includes(player.playerId)) continue;
      if (isFinaleRound && state.currentTurnPlayerId !== player.playerId) continue;
      if (!getBigSpenderBoardForPlayer(state, player.playerId).some((wallet) => wallet.state === 'hidden')) continue;
      const delay = getAiActionDelayMs(state.startingPlayerCount, aiRngRef.current);
      const timer = setTimeout(() => {
        aiTimersRef.current.delete(player.playerId);
        setState((previous) => {
          const actor = previous.players.find((entry) => entry.playerId === player.playerId);
          if (!actor || actor.isHuman || actor.status !== 'active') return previous;
          const shouldOpen =
            actor.walletsOpened < BIG_SPENDER_CONFIG.minWalletsBeforeLock ||
            decideAiShouldOpen(actor.balance, aiRngRef.current);
          if (!shouldOpen) return lockBigSpenderPlayer(previous, actor.playerId);
          const wallet = chooseAiWallet(previous, actor.playerId, aiRngRef.current);
          return wallet
            ? openBigSpenderWallet(previous, actor.playerId, wallet.walletId)
            : lockBigSpenderPlayer(previous, actor.playerId);
        });
      }, delay);
      timers.set(player.playerId, timer);
    }
  }, [isFinaleRound, state]);

  useEffect(() => {
    const timers = aiTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const newMessages = state.events
      .filter(isBroadcastEvent)
      .slice()
      .reverse()
      .filter((event) => {
        const key = getBroadcastKey(event);
        if (broadcastKeysRef.current.has(key)) return false;
        broadcastKeysRef.current.add(key);
        return true;
      })
      .map((event) => event.message);

    if (newMessages.length === 0) return;
    broadcastQueueRef.current.push(...newMessages);
    if (broadcastTimerRef.current) return;

    const drain = () => {
      const nextMessage = broadcastQueueRef.current.shift();
      if (nextMessage) setBroadcasts([nextMessage]);
      broadcastTimerRef.current = broadcastQueueRef.current.length > 0 ? setTimeout(drain, 2200) : null;
    };
    broadcastTimerRef.current = setTimeout(drain, 450);
  }, [state.events]);

  useEffect(() => {
    return () => {
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!humanAdRescuePending) {
      const resetTimer = setTimeout(() => setBombDramaStage(null), 0);
      return () => clearTimeout(resetTimer);
    }
    const timers = [
      setTimeout(() => setBombDramaStage('impact'), 0),
      setTimeout(() => setBombDramaStage('cracked'), BOMB_IMPACT_MS),
      setTimeout(() => setBombDramaStage('prompt'), BOMB_PROMPT_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [humanAdRescuePending, pendingAdRescueWalletId]);

  useEffect(() => {
    if (!humanZeroEventKey || zeroDramaKeysRef.current.has(humanZeroEventKey)) return;
    zeroDramaKeysRef.current.add(humanZeroEventKey);
    const showTimer = setTimeout(() => setZeroDramaVisible(true), 0);
    const hideTimer = setTimeout(() => setZeroDramaVisible(false), ZERO_RESULTS_DELAY_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [humanZeroEventKey]);

  useEffect(() => {
    if (state.status !== 'completed') {
      const resetTimer = setTimeout(() => setShowResults(false), 0);
      return () => clearTimeout(resetTimer);
    }
    const revealDelay = humanZeroFinished ? ZERO_RESULTS_DELAY_MS : WINNER_CELEBRATION_MS;
    const timer = setTimeout(() => setShowResults(true), revealDelay);
    return () => clearTimeout(timer);
  }, [humanZeroFinished, state.status]);

  useEffect(() => {
    wallTransitionTimersRef.current.forEach(clearTimeout);
    wallTransitionTimersRef.current = [];
    wallTransitionRunningRef.current = false;
    if (latestRevealTimerRef.current) clearTimeout(latestRevealTimerRef.current);
    latestRevealTimerRef.current = null;
    const resetTimer = setTimeout(() => {
      setWallView({ roundNumber: state.roundNumber, index: 0 });
      setWallTransitionStage(null);
      setLatestReveal(null);
      setLatestRevealVisible(false);
    }, 0);
    return () => clearTimeout(resetTimer);
  }, [state.roundNumber]);

  useEffect(() => {
    if (
      state.status !== 'running' ||
      !humanPlayer ||
      humanPlayer.status !== 'active' ||
      !firstWallExhausted ||
      !hasFreshWall ||
      effectiveWallIndex !== 0 ||
      humanAdRescuePending ||
      wallTransitionRunningRef.current
    ) {
      return;
    }

    wallTransitionRunningRef.current = true;
    const startTimer = setTimeout(() => setWallTransitionStage('clearing'), 0);
    const swapTimer = setTimeout(() => {
      setWallView({ roundNumber: state.roundNumber, index: 1 });
      setWallTransitionStage('entering');
    }, WALL_CLEAR_MS);
    const finishTimer = setTimeout(() => {
      setWallTransitionStage(null);
      wallTransitionRunningRef.current = false;
    }, WALL_TRANSITION_MS);
    wallTransitionTimersRef.current = [startTimer, swapTimer, finishTimer];
  }, [
    effectiveWallIndex,
    firstWallExhausted,
    hasFreshWall,
    humanAdRescuePending,
    humanPlayer,
    state.roundNumber,
    state.status,
  ]);

  useEffect(() => {
    return () => {
      if (latestRevealTimerRef.current) clearTimeout(latestRevealTimerRef.current);
      wallTransitionTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const openWallet = (walletId: string) => {
    if (!humanPlayer || !canHumanOpen || wallTransitionStage !== null) return;
    const wallet = visibleWallets.find((entry) => entry.walletId === walletId);
    if (wallet) {
      const previousBalance = humanPlayer.balance;
      setLatestReveal({
        roundNumber: state.roundNumber,
        outcome: wallet.outcome,
        secondChance: humanSecondChancePending,
        previousBalance,
        nextBalance: getBalanceAfterOutcome(previousBalance, wallet.outcome),
      });
      setLatestRevealVisible(true);
      if (latestRevealTimerRef.current) clearTimeout(latestRevealTimerRef.current);
      latestRevealTimerRef.current = setTimeout(() => setLatestRevealVisible(false), LATEST_REVEAL_MS);
    }
    setState((previous) =>
      openBigSpenderWallet(
        previous,
        humanPlayer.playerId,
        walletId,
        humanSecondChancePending ? 'secondChance' : 'normal',
      ),
    );
  };

  const finish = () => {
    if (resultCommitted || !winner) return;
    setResultCommitted(true);
    props.onFinish?.(ranking.length - winner.rank + 1, 0, {
      authoritativeWinnerId: winner.playerId,
      rawValue: ranking.length - winner.rank + 1,
      rawResults: buildBigSpenderRawResults(state),
    });
  };

  const statusMessage = (() => {
    if (fastForwarding) return 'Fast forwarding the house feed...';
    if (humanFinishedWhileRunning) return 'Your score is locked. The remaining players are still finishing.';
    if (humanWaitingForFinaleTurn) return 'The finale board is shared. The other finalist is choosing.';
    if (humanSecondChancePending) return 'Choose one closed wallet. This pick is mandatory.';
    if (walletsUntilLock > 0)
      return `Open ${walletsUntilLock} more wallet${walletsUntilLock === 1 ? '' : 's'} before you can lock.`;
    return isFinaleRound ? 'Your finale turn is live.' : 'You can lock now or keep pushing toward zero.';
  })();

  const getWalletOpenedByLabel = (wallet: BigSpenderWallet) => {
    if (!isFinaleRound || wallet.state !== 'revealed' || !wallet.openedByPlayerId) return null;
    return state.players.find((player) => player.playerId === wallet.openedByPlayerId)?.displayName ?? 'Finalist';
  };

  return (
    <div
      className={[
        'big-spender',
        humanAdRescuePending && bombDramaStage === 'cracked' ? 'big-spender--cracked' : '',
        zeroDramaVisible ? 'big-spender--zeroing' : '',
        humanSecondChancePending ? 'big-spender--second-chance' : '',
      ].join(' ')}
      data-testid="big-spender-game"
    >
      <header className="big-spender__cockpit">
        <div className="big-spender__title-lockup">
          <span className="big-spender__round-chip">
            {humanSecondChancePending
              ? 'Second chance'
              : isFinaleRound
                ? 'Round 5 · Finale'
                : `Round ${state.roundNumber}`}
          </span>
          <div>
            <strong>Big Spender</strong>
            <span>Broke or Boom</span>
          </div>
        </div>
      </header>

      <section className="big-spender__dashboard" aria-live="polite">
        <article className={`big-spender__balance-card big-spender__balance-card--${balanceZone.tone}`}>
          <span className="big-spender__metric-label">Your balance</span>
          <strong>{humanPlayer ? humanPlayer.balance.toLocaleString('en-US') : '—'}</strong>
          <small>{balanceZone.label} · Target 0</small>
        </article>
      </section>

      {isFinaleRound && finalePlayers.length > 0 && (
        <section className="big-spender__finalists" aria-label="Finalists">
          {finalePlayers.map((player) => (
            <span
              key={player.playerId}
              className={player.currentTurn ? 'big-spender__finalist big-spender__finalist--turn' : 'big-spender__finalist'}
            >
              <strong>{player.displayName}</strong>
              <em>{player.balance.toLocaleString('en-US')} Eyeoleans</em>
            </span>
          ))}
        </section>
      )}

      <BigSpenderBoard
        visibleWallets={visibleWallets}
        wallIndex={effectiveWallIndex}
        motif={visibleWallMotif}
        transitionStage={wallTransitionStage}
        openedCount={visibleWallOpened}
        closedCount={visibleWallClosed}
        secondChancePending={humanSecondChancePending}
        canOpen={canHumanOpen}
        latestReveal={displayedLatestReveal}
        onOpenWallet={openWallet}
        getOpenedByLabel={getWalletOpenedByLabel}
      />

      {!isFinaleRound && broadcasts.length > 0 && (
        <section className="big-spender__broadcasts" aria-label="House broadcasts" aria-live="polite">
          <span className="big-spender__metric-label">House feed</span>
          <p>{broadcasts[0]}</p>
        </section>
      )}

      {state.status === 'running' && (
        <footer className="big-spender__action-dock">
          <div>
            <span>{humanSecondChancePending ? 'Mandatory choice' : canHumanLock ? 'Decision unlocked' : 'Keep opening'}</span>
            <small>{statusMessage}</small>
          </div>
          {humanFinishedWhileRunning ? (
            <button
              type="button"
              className="big-spender__action big-spender__action--lock"
              onClick={() => {
                if (fastForwarding) return;
                setFastForwarding(true);
                window.setTimeout(() => {
                  setState((previous) => fastForwardBigSpenderGame(previous));
                  setFastForwarding(false);
                }, 900);
              }}
              disabled={fastForwarding}
            >
              {fastForwarding ? 'Forwarding…' : 'Fast forward'}
            </button>
          ) : humanWaitingForFinaleTurn ? (
            <button type="button" className="big-spender__action big-spender__action--lock" disabled>
              Waiting…
            </button>
          ) : canHumanLock ? (
            <button
              type="button"
              className="big-spender__action big-spender__action--lock"
              onClick={() => {
                if (humanPlayer) setState((previous) => lockBigSpenderPlayer(previous, humanPlayer.playerId));
              }}
            >
              Lock {humanPlayer?.balance.toLocaleString('en-US') ?? ''}
            </button>
          ) : null}
        </footer>
      )}

      <BigSpenderOverlays
        bombDramaStage={bombDramaStage}
        humanAdRescuePending={humanAdRescuePending}
        zeroDramaVisible={zeroDramaVisible}
        winnerCelebrationVisible={winnerCelebrationVisible}
        winner={winner}
        latestRoundResult={latestRoundResult}
        roundSummaryPlayers={roundSummaryPlayers}
        humanEliminatedInSummary={humanEliminatedInSummary}
        showRoundSummary={shouldShowRoundSummary}
        showResults={shouldShowResults}
        ranking={ranking}
        resultCommitted={resultCommitted}
        onResolveAdRescue={(completed) =>
          setState((previous) => resolveBigSpenderAdRescue(previous, completed ? 'completed' : 'declined'))
        }
        onContinueRound={() => setState((previous) => continueBigSpenderRound(previous))}
        onSkipToResults={() => setState((previous) => skipBigSpenderToResults(previous))}
        onFinish={finish}
      />
    </div>
  );
}
