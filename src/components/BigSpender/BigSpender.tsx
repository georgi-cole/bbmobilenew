import { useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { mulberry32 } from '../../store/rng';
import {
  BIG_SPENDER_CONFIG,
  BIG_SPENDER_DISPLAY_NAME,
  buildBigSpenderRawResults,
  createInitialBigSpenderState,
  decideAiShouldOpen,
  finalizeBigSpenderByTimeout,
  finishBigSpenderTurn,
  getAiActionDelayMs,
  isFunnyAmount,
  lockBigSpenderPlayer,
  openBigSpenderWallet,
  rankBigSpenderPlayers,
  resolveBigSpenderAdRescue,
  resolveBigSpenderBonusOffer,
  resolveBigSpenderParticipants,
  type BigSpenderPlayerState,
  type BigSpenderState,
  type BigSpenderWallet,
} from './bigSpenderLogic';
import './BigSpender.css';

const TICK_MS = 250;

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'P';
}

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

function getOutcomeCopy(state: BigSpenderState) {
  const event = state.events.find((entry) => entry.type === 'walletOpened' && entry.outcome);
  if (!event?.outcome) return 'Pick a wallet. Spend down to zero without finding a bomb.';
  if (event.outcome.type === 'bomb') return 'Bomb wallet. The room just got expensive.';
  const amount = event.outcome.amount ?? 0;
  const funny = isFunnyAmount(amount) ? ' House number hit.' : '';
  if (amount < 0) return `Spent ${Math.abs(amount)} Eyeoleans.${funny}`;
  return `Gained ${amount} Eyeoleans.${funny}`;
}

function chooseAiWallet(state: BigSpenderState, rng: () => number) {
  const available = state.board.filter((wallet) => wallet.state === 'hidden');
  return available[Math.floor(rng() * available.length)] ?? available[0] ?? null;
}

export default function BigSpender(props: GenericMinigameProps) {
  const participants = useMemo(
    () => resolveBigSpenderParticipants(props.participants, props.participantIds),
    [props.participants, props.participantIds],
  );
  const seed = props.seed || 73_337;
  const [state, setState] = useState(() => createInitialBigSpenderState(participants, seed));
  const [remainingMs, setRemainingMs] = useState(state.timerDurationMs);
  const [resultCommitted, setResultCommitted] = useState(false);
  const aiRngRef = useRef(mulberry32((seed ^ 0x5eedcafe) >>> 0));
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPlayer = useMemo(
    () => state.players.find((player) => player.playerId === state.currentTurnPlayerId) ?? null,
    [state.currentTurnPlayerId, state.players],
  );
  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const ranking = useMemo(() => rankBigSpenderPlayers(state.players), [state.players]);
  const winner = ranking[0] ?? null;
  const likelyWinningBalance = useMemo(() => {
    const candidates = state.players.filter((player) => player.status !== 'bombed');
    return Math.min(...candidates.map((player) => player.balance));
  }, [state.players]);
  const canHumanAct = Boolean(
    currentPlayer?.isHuman &&
    currentPlayer.status === 'active' &&
    state.status === 'running' &&
    !state.pendingAdRescue &&
    !state.pendingBonus &&
    !state.postWalletLockPlayerId,
  );
  const canPostWalletLock = Boolean(
    humanPlayer && state.postWalletLockPlayerId === humanPlayer.playerId && state.status === 'running',
  );

  useEffect(() => {
    if (state.status !== 'running' || state.timerPaused) return;
    const timer = setInterval(() => {
      setRemainingMs((remaining) => {
        const next = Math.max(0, remaining - TICK_MS);
        if (next === 0) {
          setState((previous) => finalizeBigSpenderByTimeout(previous));
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [state.status, state.timerPaused]);

  useEffect(() => {
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (state.status !== 'running' || state.pendingAdRescue || state.postWalletLockPlayerId) return;

    if (state.pendingBonus) {
      const bonusPlayer = state.players.find((player) => player.playerId === state.pendingBonus?.playerId);
      if (!bonusPlayer || bonusPlayer.isHuman) return;
      aiTimerRef.current = setTimeout(() => {
        setState((previous) => {
          const actor = previous.players.find((player) => player.playerId === previous.pendingBonus?.playerId);
          const accept = actor ? decideAiShouldOpen(actor.balance, aiRngRef.current, { secondsRemaining: Math.ceil(remainingMs / 1000), likelyWinningBalance }) : false;
          return resolveBigSpenderBonusOffer(previous, accept);
        });
      }, 650);
      return () => {
        if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      };
    }

    if (!currentPlayer || currentPlayer.isHuman || currentPlayer.status !== 'active') return;
    const delay = getAiActionDelayMs(state.startingPlayerCount, aiRngRef.current);
    aiTimerRef.current = setTimeout(() => {
      setState((previous) => {
        const actor = previous.players.find((player) => player.playerId === previous.currentTurnPlayerId);
        if (!actor || actor.isHuman || actor.status !== 'active') return previous;
        const shouldOpen = decideAiShouldOpen(actor.balance, aiRngRef.current, {
          secondsRemaining: Math.ceil(remainingMs / 1000),
          likelyWinningBalance,
        });
        if (!shouldOpen) return lockBigSpenderPlayer(previous, actor.playerId);
        const wallet = chooseAiWallet(previous, aiRngRef.current);
        if (!wallet) return finalizeBigSpenderByTimeout(previous);
        return openBigSpenderWallet(previous, actor.playerId, wallet.walletId);
      });
    }, delay);
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [currentPlayer, likelyWinningBalance, remainingMs, state]);

  const openWallet = (walletId: string) => {
    if (!currentPlayer || !canHumanAct) return;
    setState((previous) => openBigSpenderWallet(previous, currentPlayer.playerId, walletId));
  };

  const lockHuman = () => {
    if (!humanPlayer) return;
    setState((previous) => lockBigSpenderPlayer(previous, humanPlayer.playerId));
  };

  const continueHumanTurn = () => {
    setState((previous) => finishBigSpenderTurn(previous));
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
    <div className="big-spender" data-testid="big-spender-game">
      <header className="big-spender__header">
        <div className="big-spender__title-block">
          <span className="big-spender__eyebrow">Eyeoleans at risk</span>
          <h1>{BIG_SPENDER_DISPLAY_NAME}</h1>
        </div>
        <div className="big-spender__timer" aria-label={`${formatTime(remainingMs)} remaining`}>
          <span>{state.timerPaused ? 'Paused' : 'Clock'}</span>
          <strong>{formatTime(remainingMs)}</strong>
        </div>
      </header>

      <section className="big-spender__status-panel" aria-live="polite">
        <div>
          <span className="big-spender__eyebrow">Current turn</span>
          <strong>{currentPlayer?.displayName ?? 'Results'}</strong>
        </div>
        <p>{getOutcomeCopy(state)}</p>
        {humanPlayer && (
          <span className="big-spender__save-counter">
            Ad saves left: {BIG_SPENDER_CONFIG.maxAdBombRescues - humanPlayer.adBombRescuesUsed}
          </span>
        )}
      </section>

      <main className="big-spender__table">
        <section className="big-spender__board" aria-label="Wallet board">
          {state.board.map((wallet) => (
            <button
              key={wallet.walletId}
              type="button"
              className={`big-spender__wallet big-spender__wallet--color-${wallet.generationColor}`}
              disabled={!canHumanAct || wallet.state !== 'hidden'}
              onClick={() => openWallet(wallet.walletId)}
              aria-label={getWalletAriaLabel(wallet)}
            >
              <span className="big-spender__wallet-flap" aria-hidden="true" />
              <span className="big-spender__wallet-id">{wallet.boardSlotIndex + 1}</span>
              <span className="big-spender__wallet-generation">G{wallet.generationNumber}</span>
            </button>
          ))}
        </section>

        <aside className="big-spender__players" aria-label="Player balances">
          {state.players.map((player) => (
            <article
              key={player.playerId}
              className={[
                'big-spender__player',
                player.currentTurn ? 'big-spender__player--current' : '',
                player.isHuman ? 'big-spender__player--human' : '',
                `big-spender__player--${player.status}`,
              ].join(' ')}
            >
              <span className="big-spender__avatar" aria-hidden="true">{player.avatar || getInitials(player.displayName)}</span>
              <div className="big-spender__player-copy">
                <strong>{player.displayName}</strong>
                <span>{getPlayerLabel(player)} - {player.walletsOpened} wallets</span>
              </div>
              <data value={player.balance}>{player.balance}</data>
            </article>
          ))}
        </aside>
      </main>

      {canHumanAct && (
        <footer className="big-spender__actions">
          <button type="button" className="big-spender__action big-spender__action--lock" onClick={lockHuman}>
            Lock
          </button>
          <span>Open any wallet or lock your balance.</span>
        </footer>
      )}

      {canPostWalletLock && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal">
            <span className="big-spender__eyebrow">Lock window</span>
            <h2>Keep that balance?</h2>
            <p>You can lock now, or pass the turn and keep chasing zero next time.</p>
            <div className="big-spender__modal-actions">
              <button type="button" onClick={lockHuman}>Lock balance</button>
              <button type="button" onClick={continueHumanTurn}>Keep playing</button>
            </div>
          </div>
        </div>
      )}

      {state.pendingBonus && humanPlayer?.playerId === state.pendingBonus.playerId && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal">
            <span className="big-spender__eyebrow">Bonus wallet</span>
            <h2>One more wallet?</h2>
            <p>The bonus uses normal odds, but cannot trigger another bonus.</p>
            <div className="big-spender__modal-actions">
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderBonusOffer(previous, true))}>Open bonus</button>
              <button type="button" onClick={() => setState((previous) => resolveBigSpenderBonusOffer(previous, false))}>Decline</button>
            </div>
          </div>
        </div>
      )}

      {state.pendingAdRescue && humanPlayer?.playerId === state.pendingAdRescue.playerId && (
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

      {state.status === 'completed' && (
        <div className="big-spender__overlay">
          <div className="big-spender__modal big-spender__modal--results">
            <span className="big-spender__eyebrow">Final ranking</span>
            <h2>{winner?.displayName ?? 'Someone'} wins</h2>
            <ol className="big-spender__ranking">
              {ranking.map((player) => (
                <li key={player.playerId}>
                  <span>{player.rank}</span>
                  <strong>{player.displayName}</strong>
                  <em>{player.balance} Eyeoleans - {getPlayerLabel(player)}</em>
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
