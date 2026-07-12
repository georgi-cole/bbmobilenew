import { useEffect, useMemo, useRef, useState } from 'react';
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

type BombDramaStage = 'impact' | 'cracked' | 'prompt' | null;

const BOMB_ICON = '\u{1F4A3}';
const BOMB_IMPACT_MS = 760;
const BOMB_PROMPT_MS = 2200;
const ZERO_RESULTS_DELAY_MS = 2600;
const WINNER_CELEBRATION_MS = 1900;
const RESULT_MEDALS = ['1', '2', '3'] as const;

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

function chooseAiWallet(state: BigSpenderState, playerId: string, rng: () => number) {
  const available = getBigSpenderBoardForPlayer(state, playerId).filter((wallet) => wallet.state === 'hidden');
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
  const aiRngRef = useRef(mulberry32((seed ^ 0x5eedcafe) >>> 0));
  const aiTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const broadcastQueueRef = useRef<string[]>([]);
  const broadcastKeysRef = useRef(new Set<string>());
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeroDramaKeysRef = useRef(new Set<string>());

  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const humanBoard = useMemo(
    () => humanPlayer ? getBigSpenderBoardForPlayer(state, humanPlayer.playerId) : state.board,
    [humanPlayer, state],
  );
  const ranking = useMemo(
    () => state.status === 'completed' ? rankBigSpenderGame(state) : rankBigSpenderPlayers(state.players.filter((player) => state.activePlayerIds.includes(player.playerId))),
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
  const humanSecondChancePending = Boolean(state.pendingSecondChance && humanPlayer?.playerId === state.pendingSecondChance.playerId);
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
  const winnerCelebrationVisible = Boolean(state.status === 'completed' && winner && !showResults && !zeroDramaVisible);

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
          const shouldOpen = actor.walletsOpened < BIG_SPENDER_CONFIG.minWalletsBeforeLock || decideAiShouldOpen(actor.balance, aiRngRef.current);
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

  const openWallet = (walletId: string) => {
    if (!humanPlayer || !canHumanOpen) return;
    setState((previous) => openBigSpenderWallet(
      previous,
      humanPlayer.playerId,
      walletId,
      humanSecondChancePending ? 'secondChance' : 'normal',
    ));
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
    if (humanFinishedWhileRunning) return 'You are done here. The house is still finishing this round.';
    if (humanWaitingForFinaleTurn) return 'Finale board is shared. Waiting for the other finalist to pick.';
    if (humanSecondChancePending) return 'Pick any closed wallet yourself.';
    if (walletsUntilLock > 0) return `${walletsUntilLock} more wallet${walletsUntilLock === 1 ? '' : 's'} to unlock Lock in.`;
    return isFinaleRound ? 'Finale turn is live.' : 'Lock in is ready.';
  })();

  return (
    <div className={[
      'big-spender',
      humanAdRescuePending && bombDramaStage === 'cracked' ? 'big-spender--cracked' : '',
      zeroDramaVisible ? 'big-spender--zeroing' : '',
      humanSecondChancePending ? 'big-spender--second-chance' : '',
    ].join(' ')} data-testid="big-spender-game">
      <section className="big-spender__status-panel" aria-live="polite">
        <div>
          <span className="big-spender__eyebrow">
            {humanSecondChancePending ? 'Second chance' : isFinaleRound ? 'Round 5 finale' : `Round ${state.roundNumber}`}
          </span>
          <strong>{humanPlayer ? `${humanPlayer.balance} Eyeoleans` : 'Results'}</strong>
          {state.status === 'running' && (
            <small className={humanFinishedWhileRunning || humanWaitingForFinaleTurn || fastForwarding ? 'big-spender__status-note--live' : ''}>
              {statusMessage}
              {(humanFinishedWhileRunning || humanWaitingForFinaleTurn || fastForwarding) && <span className="big-spender__status-loader" aria-hidden="true" />}
            </small>
          )}
          {isFinaleRound && finalePlayers.length > 0 && (
            <div className="big-spender__finalists" aria-label="Finalists">
              {finalePlayers.map((player) => (
                <span
                  key={player.playerId}
                  className={player.currentTurn ? 'big-spender__finalist big-spender__finalist--turn' : 'big-spender__finalist'}
                >
                  <strong>{player.displayName}</strong>
                  <em>{player.balance} Eyeoleans</em>
                </span>
              ))}
            </div>
          )}
        </div>
        {state.status === 'running' && humanFinishedWhileRunning && (
          <button type="button" className="big-spender__action big-spender__action--lock" onClick={fastForwardHouse} disabled={fastForwarding}>
            {fastForwarding ? 'Forwarding' : 'Fast forward'}
          </button>
        )}
        <button type="button" className="big-spender__info" onClick={() => setShowRules(true)} aria-label="Show rules">
          i
        </button>
        {state.status === 'running' && !humanFinishedWhileRunning && (
          <button type="button" className="big-spender__action big-spender__action--lock" onClick={lockHuman} disabled={!canHumanLock}>
            Lock in
          </button>
        )}
      </section>

      <main className="big-spender__table">
        <section className="big-spender__board" aria-label="Wallet board">
          {humanBoard.map((wallet) => {
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
                  wallet.outcome.type === 'bomb' && wallet.state === 'revealed' ? 'big-spender__wallet--bomb' : '',
                  humanSecondChancePending && wallet.state === 'hidden' ? 'big-spender__wallet--second-chance' : '',
                ].join(' ')}
                disabled={!canHumanOpen || wallet.state !== 'hidden'}
                onClick={() => openWallet(wallet.walletId)}
                aria-label={getWalletAriaLabelForState(wallet, humanSecondChancePending)}
              >
                <span className="big-spender__wallet-flap" aria-hidden="true" />
                <span className="big-spender__wallet-id">{wallet.boardSlotIndex + 1}</span>
                {resultLabel ? (
                  <>
                    <strong className="big-spender__wallet-result">{resultLabel}</strong>
                    {openedByLabel && <span className="big-spender__wallet-opener">{openedByLabel}</span>}
                  </>
                ) : (
                  <span className="big-spender__wallet-generation">{humanSecondChancePending ? 'Pick' : 'Tap'}</span>
                )}
              </button>
            );
          })}
        </section>

      </main>

      {!isFinaleRound && broadcasts.length > 0 && (
        <section className="big-spender__broadcasts" aria-label="House broadcasts" aria-live="polite">
          {broadcasts.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </section>
      )}

      {showRules && (
        <div className="big-spender__overlay" role="dialog" aria-modal="true" aria-label="Big Spender rules">
          <div className="big-spender__modal big-spender__modal--rules">
            <span className="big-spender__eyebrow">Quick rules</span>
            <h2>Broke or Boom</h2>
            <p>Start at 1,200. Open at least 8 wallets, then lock in as close to 0 as you dare. Bombed players rank last.</p>
            <p>Rounds 1–4 use private boards. The final two alternate on one shared board.</p>
            <button type="button" onClick={() => setShowRules(false)}>Got it</button>
          </div>
        </div>
      )}

      {humanAdRescuePending && bombDramaStage && bombDramaStage !== 'prompt' && (
        <div className={`big-spender__screen-drama big-spender__screen-drama--${bombDramaStage}`} aria-hidden="true">
          <span className="big-spender__screen-drama-icon">{BOMB_ICON}</span>
        </div>
      )}

      {zeroDramaVisible && (
        <div className="big-spender__screen-drama big-spender__screen-drama--zero" aria-hidden="true">
          <span className="big-spender__screen-drama-kicker">Perfect broke</span>
          <strong>0</strong>
          <span className="big-spender__screen-drama-caption">You hit the cleanest possible landing.</span>
        </div>
      )}

      {winnerCelebrationVisible && winner && (
        <div className="big-spender__screen-drama big-spender__screen-drama--winner" aria-live="assertive">
          <span className="big-spender__screen-drama-kicker">Winner locked</span>
          <strong>{winner.displayName}</strong>
          <span className="big-spender__screen-drama-caption">Final results are coming in.</span>
        </div>
      )}

      {humanAdRescuePending && bombDramaStage === 'prompt' && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--danger">
            <span className="big-spender__eyebrow">Bomb save</span>
            <h2>Watch an ad for one last wallet?</h2>
            <p>If the ad completes, the bomb is cancelled and you choose one closed wallet as your mandatory Second Chance Wallet.</p>
            <div className="big-spender__modal-actions">
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderAdRescue(previous, 'completed'))}>Watch ad</button>
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderAdRescue(previous, 'declined'))}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {shouldShowRoundSummary && latestRoundResult && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--round">
            <span className="big-spender__eyebrow">Round {latestRoundResult.roundNumber} results</span>
            <h2>
              {humanEliminatedInSummary
                ? 'You were eliminated'
                : latestRoundResult.survivorPlayerIds.length <= BIG_SPENDER_CONFIG.roundFourFinalistCount
                  ? 'Finale is set'
                  : 'You survived'}
            </h2>
            <p>
              {humanEliminatedInSummary
                ? 'The house keeps playing from here.'
                : latestRoundResult.survivorPlayerIds.length <= BIG_SPENDER_CONFIG.roundFourFinalistCount
                  ? 'Two finalists remain for the shared-board finale.'
                  : `${latestRoundResult.survivorPlayerIds.length} players move on.`}
            </p>
            <ol className="big-spender__ranking big-spender__ranking--round">
              {roundSummaryPlayers.map((player) => {
                const eliminated = latestRoundResult.eliminatedPlayerIds.includes(player.playerId);
                return (
                  <li key={player.playerId} className={eliminated ? 'big-spender__ranking-item--eliminated' : ''}>
                    <span>{player.rank}</span>
                    <strong>{player.displayName}</strong>
                    <em>{eliminated ? 'Eliminated' : `${player.walletsOpened} wallets - ${getPlayerLabel(player)}`}</em>
                  </li>
                );
              })}
            </ol>
            <div className="big-spender__modal-actions">
              {humanEliminatedInSummary ? (
                <>
                  <button type="button" onClick={continueRound}>Watch as spectator</button>
                  <button type="button" onClick={skipToResults}>Skip to results</button>
                </>
              ) : (
                <button type="button" onClick={continueRound}>
                  {latestRoundResult.survivorPlayerIds.length <= BIG_SPENDER_CONFIG.roundFourFinalistCount ? 'Start finale' : 'Next round'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {shouldShowResults && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--results">
            <div className="big-spender__results-hero">
              <span className="big-spender__results-trophy" aria-hidden="true">Winner</span>
              <span className="big-spender__eyebrow">Final results</span>
              <h2>{winner?.displayName ?? 'Someone'} wins</h2>
              <p>Big Spender is complete. The final standings are locked.</p>
            </div>
            <ol className="big-spender__ranking big-spender__ranking--final" aria-label="Final rankings">
              {ranking.map((player) => (
                <li
                  key={player.playerId}
                  className={[
                    player.rank === 1 ? 'big-spender__ranking-item--winner' : '',
                    player.isHuman ? 'big-spender__ranking-item--you' : '',
                  ].join(' ')}
                >
                  <span>{RESULT_MEDALS[player.rank - 1] ?? player.rank}</span>
                  <strong>{player.displayName}</strong>
                  <em>{player.balance} Eyeoleans - {getPlayerLabel(player)} - {player.walletsOpened} wallets</em>
                </li>
              ))}
            </ol>
            <button type="button" className="big-spender__results-cta" onClick={finish} disabled={resultCommitted}>Continue</button>
          </div>
        </div>
      )}
    </div>
  );
}
