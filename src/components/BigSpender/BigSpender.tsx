import { useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { mulberry32 } from '../../store/rng';
import {
  buildBigSpenderRawResults,
  createInitialBigSpenderState,
  decideAiShouldOpen,
  getAiActionDelayMs,
  getBigSpenderBoardForPlayer,
  lockBigSpenderPlayer,
  openBigSpenderWallet,
  rankBigSpenderPlayers,
  resolveBigSpenderAdRescue,
  resolveBigSpenderParticipants,
  type BigSpenderPlayerState,
  type BigSpenderState,
  type BigSpenderWallet,
} from './bigSpenderLogic';
import './BigSpender.css';

type BombDramaStage = 'impact' | 'cracked' | 'prompt' | null;

const BOMB_IMPACT_MS = 560;
const BOMB_PROMPT_MS = 1650;
const ZERO_RESULTS_DELAY_MS = 1800;

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
  if (wallet.outcome.type === 'bomb') return '💣';
  const amount = wallet.outcome.amount ?? 0;
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

function chooseAiWallet(state: BigSpenderState, playerId: string, rng: () => number) {
  const available = getBigSpenderBoardForPlayer(state, playerId).filter((wallet) => wallet.state === 'hidden');
  return available[Math.floor(rng() * available.length)] ?? available[0] ?? null;
}

function isBroadcastEvent(event: BigSpenderState['events'][number]) {
  return event.type === 'walletOpened' || event.type === 'playerLocked' || event.type === 'playerBombed' || event.type === 'playerZeroFinished';
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
  const ranking = useMemo(() => rankBigSpenderPlayers(state.players), [state.players]);
  const winner = ranking[0] ?? null;
  const canHumanAct = Boolean(
    humanPlayer &&
    humanPlayer.status === 'active' &&
    state.status === 'running' &&
    state.pendingAdRescue?.playerId !== humanPlayer.playerId,
  );
  const humanAdRescuePending = Boolean(state.pendingAdRescue && humanPlayer?.playerId === state.pendingAdRescue.playerId);
  const pendingAdRescueWalletId = state.pendingAdRescue?.walletId ?? null;
  const humanZeroFinished = humanPlayer?.status === 'zeroFinished';
  const humanZeroEvent = humanPlayer
    ? state.events.find((event) => event.type === 'playerZeroFinished' && event.playerId === humanPlayer.playerId)
    : null;
  const humanZeroEventKey = humanZeroEvent ? getBroadcastKey(humanZeroEvent) : null;
  const shouldShowResults = state.status === 'completed' && showResults;

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
      if (!getBigSpenderBoardForPlayer(state, player.playerId).some((wallet) => wallet.state === 'hidden')) continue;
      const delay = getAiActionDelayMs(state.startingPlayerCount, aiRngRef.current);
      const timer = setTimeout(() => {
        aiTimersRef.current.delete(player.playerId);
        setState((previous) => {
          const actor = previous.players.find((entry) => entry.playerId === player.playerId);
          if (!actor || actor.isHuman || actor.status !== 'active') return previous;
          const shouldOpen = actor.walletsOpened === 0 || decideAiShouldOpen(actor.balance, aiRngRef.current);
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
        setBroadcasts((previous) => [nextMessage, ...previous].slice(0, 3));
      }
      broadcastTimerRef.current = broadcastQueueRef.current.length > 0 ? setTimeout(drain, 1350) : null;
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
    const timer = setTimeout(() => setShowResults(true), humanZeroFinished ? ZERO_RESULTS_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [humanZeroFinished, state.status]);

  const openWallet = (walletId: string) => {
    if (!humanPlayer || !canHumanAct) return;
    setState((previous) => openBigSpenderWallet(previous, humanPlayer.playerId, walletId));
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
      rawResults: buildBigSpenderRawResults(state.players),
    });
  };

  return (
    <div className={[
      'big-spender',
      humanAdRescuePending && bombDramaStage === 'cracked' ? 'big-spender--cracked' : '',
      zeroDramaVisible ? 'big-spender--zeroing' : '',
    ].join(' ')} data-testid="big-spender-game">
      <section className="big-spender__status-panel" aria-live="polite">
        <div>
          <span className="big-spender__eyebrow">Live balance</span>
          <strong>{humanPlayer ? `${humanPlayer.balance} Eyeoleans` : 'Results'}</strong>
        </div>
        {state.status === 'running' && (
          <button type="button" className="big-spender__action big-spender__action--lock" onClick={lockHuman} disabled={!canHumanAct}>
            Lock in
          </button>
        )}
      </section>

      <main className="big-spender__table">
        <section className="big-spender__board" aria-label="Wallet board">
          {humanBoard.map((wallet) => {
            const resultLabel = getWalletResultLabel(wallet);
            return (
              <button
                key={wallet.walletId}
                type="button"
                className={[
                  'big-spender__wallet',
                  `big-spender__wallet--color-${wallet.generationColor}`,
                  wallet.state === 'revealed' ? 'big-spender__wallet--revealed' : '',
                  wallet.outcome.type === 'bomb' && wallet.state === 'revealed' ? 'big-spender__wallet--bomb' : '',
                ].join(' ')}
                disabled={!canHumanAct || wallet.state !== 'hidden'}
                onClick={() => openWallet(wallet.walletId)}
                aria-label={getWalletAriaLabel(wallet)}
              >
                <span className="big-spender__wallet-flap" aria-hidden="true" />
                <span className="big-spender__wallet-id">{wallet.boardSlotIndex + 1}</span>
                {resultLabel ? (
                  <strong className="big-spender__wallet-result">{resultLabel}</strong>
                ) : (
                  <span className="big-spender__wallet-generation">Tap</span>
                )}
              </button>
            );
          })}
        </section>

      </main>

      {broadcasts.length > 0 && (
        <section className="big-spender__broadcasts" aria-label="House broadcasts" aria-live="polite">
          {broadcasts.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </section>
      )}

      {humanAdRescuePending && bombDramaStage && bombDramaStage !== 'prompt' && (
        <div className={`big-spender__screen-drama big-spender__screen-drama--${bombDramaStage}`} aria-hidden="true">
          <span className="big-spender__screen-drama-icon">💣</span>
        </div>
      )}

      {zeroDramaVisible && (
        <div className="big-spender__screen-drama big-spender__screen-drama--zero" aria-hidden="true">
          <span className="big-spender__screen-drama-kicker">Zero hit</span>
          <strong>0</strong>
        </div>
      )}

      {humanAdRescuePending && bombDramaStage === 'prompt' && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--danger">
            <span className="big-spender__eyebrow">Bomb save</span>
            <h2>Watch an ad for one last wallet?</h2>
            <p>If the ad completes, the bomb is cancelled and a mandatory Second Chance Wallet opens immediately.</p>
            <div className="big-spender__modal-actions">
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderAdRescue(previous, 'completed'))}>Watch ad</button>
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderAdRescue(previous, 'declined'))}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {shouldShowResults && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--results">
            <span className="big-spender__eyebrow">Final ranking</span>
            <h2>{winner?.displayName ?? 'Someone'} wins</h2>
            <ol className="big-spender__ranking">
              {ranking.map((player) => (
                <li key={player.playerId}>
                  <span>{player.rank}</span>
                  <strong>{player.displayName}</strong>
                  <em>{player.balance} - {getPlayerLabel(player)} - {player.walletsOpened} wallets</em>
                </li>
              ))}
            </ol>
            <button type="button" onClick={finish} disabled={resultCommitted}>Claim result</button>
          </div>
        </div>
      )}
    </div>
  );
}
