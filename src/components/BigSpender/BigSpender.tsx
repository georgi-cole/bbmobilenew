import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { mulberry32 } from '../../store/rng';
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
  type BigSpenderPlayerState,
  type BigSpenderState,
  type BigSpenderWallet,
} from './bigSpenderLogic';
import './BigSpender.css';
import './BigSpenderModern.css';
import './BigSpenderWall.css';

type BombDramaStage = 'impact' | 'cracked' | 'prompt' | null;
type WallTransitionStage = 'clearing' | 'entering' | null;
type WallMotif = 'vault' | 'diamond';

type LatestReveal = {
  roundNumber: number;
  outcome: BigSpenderWallet['outcome'];
  secondChance: boolean;
  previousBalance: number;
  nextBalance: number;
};

const BOMB_ICON = '\u{1F4A3}';
const BOMB_IMPACT_MS = 760;
const BOMB_PROMPT_MS = 2200;
const ZERO_RESULTS_DELAY_MS = 2600;
const WINNER_CELEBRATION_MS = 1900;
const RESULT_MEDALS = ['1', '2', '3'] as const;
const WALL_SIZE = 16;
const LATEST_REVEAL_MS = 2400;
const WALL_CLEAR_MS = 360;
const WALL_TRANSITION_MS = 860;

function getPlayerLabel(player: BigSpenderPlayerState) {
  if (player.status === 'zeroFinished') return 'Zero';
  if (player.status === 'bombed') return 'Bombed';
  if (player.status === 'locked') return 'Locked';
  if (player.finalizedAt != null) return 'Final';
  return 'Active';
}

function getWalletAriaLabel(wallet: BigSpenderWallet) {
  return `Open wallet ${wallet.boardSlotIndex + 1}, generation ${wallet.generationNumber}`;
}

function getWalletResultLabel(wallet: BigSpenderWallet) {
  if (wallet.state !== 'revealed') return null;
  if (wallet.outcome.type === 'bomb') return BOMB_ICON;
  const amount = wallet.outcome.amount ?? 0;
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

function getWalletAriaLabelForState(wallet: BigSpenderWallet, isSecondChancePick: boolean) {
  if (isSecondChancePick) return `Pick wallet ${wallet.boardSlotIndex + 1} as your Second Chance Wallet`;
  return getWalletAriaLabel(wallet);
}

function getBalanceZone(balance: number) {
  if (balance === 0) return { label: 'Perfect landing', tone: 'perfect' };
  if (balance <= 150) return { label: 'Red-hot range', tone: 'hot' };
  if (balance <= 500) return { label: 'Competitive range', tone: 'competitive' };
  if (balance <= 900) return { label: 'Still expensive', tone: 'high' };
  return { label: 'Big spender territory', tone: 'very-high' };
}

function getLatestRevealText(reveal: LatestReveal | null) {
  if (!reveal) return 'Choose a wallet to reveal its value.';
  if (reveal.outcome.type === 'bomb') return 'Bomb found. The round is on the line.';
  const amount = reveal.outcome.amount ?? 0;
  if (amount < 0) return `${Math.abs(amount)} Eyeoleans removed.`;
  return `${amount} Eyeoleans added back.`;
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

export default function BigSpender(props: GenericMinigameProps) {
  const participants = useMemo(
    () => resolveBigSpenderParticipants(props.participants, props.participantIds),
    [props.participants, props.participantIds],
  );
  const seed = props.seed || 73_337;
  const [state, setState] = useState(() => createInitialBigSpenderState(participants, seed));
  const [resultCommitted, setResultCommitted] = useState(false);
  const [broadcasts, setBroadcasts] = useState<string[]>([]);
  const [bombDramaStage, setBombDramaStage] = useState<BombDramaStage>(null);
  const [zeroDramaVisible, setZeroDramaVisible] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [fastForwarding, setFastForwarding] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [latestReveal, setLatestReveal] = useState<LatestReveal | null>(null);
  const [latestRevealVisible, setLatestRevealVisible] = useState(false);
  const [wallView, setWallView] = useState(() => ({ roundNumber: state.roundNumber, index: 0 }));
  const [wallTransitionStage, setWallTransitionStage] = useState<WallTransitionStage>(null);
  const aiRngRef = useRef(mulberry32((seed ^ 0x5eedcafe) >>> 0));
  const aiTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const broadcastQueueRef = useRef<string[]>([]);
  const broadcastKeysRef = useRef(new Set<string>());
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeroDramaKeysRef = useRef(new Set<string>());
  const latestRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wallTransitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  const lockProgress = Math.min(
    100,
    Math.round(((humanPlayer?.walletsOpened ?? 0) / BIG_SPENDER_CONFIG.minWalletsBeforeLock) * 100),
  );
  const hiddenWalletCount = humanBoard.filter((wallet) => wallet.state === 'hidden').length;
  const effectiveWallIndex = wallView.roundNumber === state.roundNumber ? wallView.index : 0;
  const firstWallWallets = humanBoard.slice(0, WALL_SIZE);
  const firstWallExhausted =
    firstWallWallets.length === WALL_SIZE && firstWallWallets.every((wallet) => wallet.state === 'revealed');
  const hasFreshWall = humanBoard.slice(WALL_SIZE, WALL_SIZE * 2).some((wallet) => wallet.state === 'hidden');
  const wallStartIndex = effectiveWallIndex * WALL_SIZE;
  const visibleWallets = humanBoard.slice(wallStartIndex, wallStartIndex + WALL_SIZE);
  const visibleWallOpened = visibleWallets.filter((wallet) => wallet.state === 'revealed').length;
  const visibleWallClosed = visibleWallets.length - visibleWallOpened;
  const firstWallMotif: WallMotif = state.roundNumber % 2 === 0 ? 'diamond' : 'vault';
  const visibleWallMotif: WallMotif =
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
    shouldShowRoundSummary &&
      humanPlayer &&
      latestRoundResult?.eliminatedPlayerIds.includes(humanPlayer.playerId),
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
      if (state.roundNumber === BIG_SPENDER_CONFIG.finalRound && state.currentTurnPlayerId !== player.playerId) continue;
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
          if (!wallet) return lockBigSpenderPlayer(previous, actor.playerId);
          return openBigSpenderWallet(previous, actor.playerId, wallet.walletId);
        });
      }, delay);
      timers.set(player.playerId, timer);
    }
  }, [state]);

  useEffect(() => {
    const timers = aiTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
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
      if (nextMessage) {
        setBroadcasts((previous) => [nextMessage, ...previous].slice(0, 2));
      }
      broadcastTimerRef.current = broadcastQueueRef.current.length > 0 ? setTimeout(drain, 2_200) : null;
    };
    broadcastTimerRef.current = setTimeout(drain, 450);
  }, [state.events]);

  useEffect(() => {
    return () => {
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
      }
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
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
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
    for (const timer of wallTransitionTimersRef.current) clearTimeout(timer);
    wallTransitionTimersRef.current = [];
    if (latestRevealTimerRef.current) clearTimeout(latestRevealTimerRef.current);
    latestRevealTimerRef.current = null;
    setTimeout(() => {
      setWallView({ roundNumber: state.roundNumber, index: 0 });
      setWallTransitionStage(null);
      setLatestReveal(null);
      setLatestRevealVisible(false);
    }, 0);
  }, [state.roundNumber]);

  useEffect(() => {
    if (
      state.status !== 'running' ||
      !firstWallExhausted ||
      !hasFreshWall ||
      effectiveWallIndex !== 0 ||
      wallTransitionStage !== null
    ) {
      return;
    }

    setTimeout(() => {
      setWallTransitionStage('clearing');
    }, 0);
    const swapTimer = setTimeout(() => {
      setWallView({ roundNumber: state.roundNumber, index: 1 });
      setWallTransitionStage('entering');
    }, WALL_CLEAR_MS);
    const finishTimer = setTimeout(() => setWallTransitionStage(null), WALL_TRANSITION_MS);
    wallTransitionTimersRef.current = [swapTimer, finishTimer];
  }, [effectiveWallIndex, firstWallExhausted, hasFreshWall, state.roundNumber, state.status, wallTransitionStage]);

  useEffect(() => {
    return () => {
      if (latestRevealTimerRef.current) clearTimeout(latestRevealTimerRef.current);
      for (const timer of wallTransitionTimersRef.current) clearTimeout(timer);
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

  const lockHuman = () => {
    if (!humanPlayer) return;
    setState((previous) => lockBigSpenderPlayer(previous, humanPlayer.playerId));
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

  const fastForwardHouse = () => {
    if (!humanFinishedWhileRunning || fastForwarding) return;
    setFastForwarding(true);
    window.setTimeout(() => {
      setState((previous) => fastForwardBigSpenderGame(previous));
      setFastForwarding(false);
    }, 900);
  };

  const continueRound = () => {
    setState((previous) => continueBigSpenderRound(previous));
  };

  const skipToResults = () => {
    setState((previous) => skipBigSpenderToResults(previous));
  };

  const getWalletOpenedByLabel = (wallet: BigSpenderWallet) => {
    if (!isFinaleRound || wallet.state !== 'revealed' || !wallet.openedByPlayerId) return null;
    return state.players.find((player) => player.playerId === wallet.openedByPlayerId)?.displayName ?? 'Finalist';
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
        <button type="button" className="big-spender__info" onClick={() => setShowRules(true)} aria-label="Show rules">
          i
        </button>
      </header>

      <section className="big-spender__dashboard" aria-live="polite">
        <article className={`big-spender__balance-card big-spender__balance-card--${balanceZone.tone}`}>
          <span className="big-spender__metric-label">Your balance</span>
          <strong>{humanPlayer ? humanPlayer.balance.toLocaleString('en-US') : '—'}</strong>
          <small>{balanceZone.label} · Target 0</small>
        </article>

        <article className="big-spender__progress-card">
          <div className="big-spender__progress-heading">
            <span className="big-spender__metric-label">Lock requirement</span>
            <strong>
              {Math.min(humanPlayer?.walletsOpened ?? 0, BIG_SPENDER_CONFIG.minWalletsBeforeLock)}/
              {BIG_SPENDER_CONFIG.minWalletsBeforeLock}
            </strong>
          </div>
          <div className="big-spender__progress-track" aria-label={`${lockProgress}% of required wallets opened`}>
            <span style={{ width: `${lockProgress}%` }} />
          </div>
          <small>{hiddenWalletCount} wallets remain on this board</small>
        </article>
      </section>

      <section className="big-spender__odds" aria-label="Wallet outcome odds">
        <div>
          <span>Typical wallet mix</span>
          <small>Every choice stays hidden until opened</small>
        </div>
        <div className="big-spender__odds-bar" aria-hidden="true">
          <span className="big-spender__odds-negative" style={{ width: '75%' }} />
          <span className="big-spender__odds-positive" style={{ width: '20%' }} />
          <span className="big-spender__odds-bomb" style={{ width: '5%' }} />
        </div>
        <div className="big-spender__odds-legend">
          <span>
            <i className="big-spender__legend-dot big-spender__legend-dot--negative" />75% subtract
          </span>
          <span>
            <i className="big-spender__legend-dot big-spender__legend-dot--positive" />20% add
          </span>
          <span>
            <i className="big-spender__legend-dot big-spender__legend-dot--bomb" />5% bomb
          </span>
        </div>
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

      <main className="big-spender__table">
        <section className="big-spender__board-shell">
          <div className="big-spender__board-heading">
            <div>
              <span className="big-spender__metric-label">
                {effectiveWallIndex === 1 ? 'Fresh wallet wall' : 'Wallet wall'}
              </span>
              <strong>
                {humanSecondChancePending
                  ? 'Choose your mandatory save'
                  : wallTransitionStage
                    ? 'Replenishing the wall'
                    : 'Tap any closed wallet'}
              </strong>
            </div>
            <span>
              {visibleWallOpened} opened · {visibleWallClosed} closed
            </span>
          </div>

          {displayedLatestReveal && (
            <div
              className={[
                'big-spender__latest-reveal',
                `big-spender__latest-reveal--${displayedLatestReveal.outcome.type}`,
              ].join(' ')}
              aria-live="polite"
            >
              <span>{displayedLatestReveal.secondChance ? 'Second Chance result' : 'Wallet result'}</span>
              <strong>
                {displayedLatestReveal.outcome.type === 'bomb'
                  ? BOMB_ICON
                  : `${(displayedLatestReveal.outcome.amount ?? 0) > 0 ? '+' : ''}${displayedLatestReveal.outcome.amount ?? 0}`}
              </strong>
              <small>
                {getLatestRevealText(displayedLatestReveal)}
                {displayedLatestReveal.outcome.type !== 'bomb' && (
                  <em>
                    {displayedLatestReveal.previousBalance.toLocaleString('en-US')} →{' '}
                    {displayedLatestReveal.nextBalance.toLocaleString('en-US')}
                  </em>
                )}
              </small>
            </div>
          )}

          <div className="big-spender__board-stage">
            {wallTransitionStage && (
              <div
                className={`big-spender__wall-replenish big-spender__wall-replenish--${wallTransitionStage}`}
                aria-live="polite"
              >
                <strong>Wallet wall replenished</strong>
                <span>Fresh wallets are sliding into place.</span>
              </div>
            )}

            <section
              className={[
                'big-spender__board',
                `big-spender__board--motif-${visibleWallMotif}`,
                wallTransitionStage ? `big-spender__board--${wallTransitionStage}` : '',
              ].join(' ')}
              aria-label={`Wallet wall ${effectiveWallIndex + 1}`}
            >
              {visibleWallets.map((wallet, wallSlotIndex) => {
                const resultLabel = getWalletResultLabel(wallet);
                const openedByLabel = getWalletOpenedByLabel(wallet);
                return (
                  <button
                    key={wallet.walletId}
                    type="button"
                    className={[
                      'big-spender__wallet',
                      `big-spender__wallet--color-${wallet.generationColor}`,
                      wallet.state === 'revealed' ? 'big-spender__wallet--revealed' : '',
                      wallet.state === 'revealed' ? `big-spender__wallet--${wallet.outcome.type}` : '',
                      resultLabel && resultLabel.length >= 4 ? 'big-spender__wallet--result-long' : '',
                      wallet.outcome.type === 'bomb' && wallet.state === 'revealed' ? 'big-spender__wallet--bomb' : '',
                      humanSecondChancePending && wallet