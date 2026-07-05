import { useEffect, useMemo, useRef, useState } from 'react';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { mulberry32 } from '../../store/rng';
import {
  BIG_SPENDER_CONFIG,
  BIG_SPENDER_DISPLAY_NAME,
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

function isImageAvatar(avatar?: string) {
  return Boolean(avatar && (/^(https?:|data:image\/|\/)/.test(avatar) || /\.(avif|jpe?g|png|webp|gif|svg)$/i.test(avatar)));
}

function getOutcomeCopy(state: BigSpenderState) {
  const event = state.events.find((entry) => entry.type === 'walletOpened' && entry.outcome);
  if (!event?.outcome) return 'Pick wallets while the house opens theirs. Lock in whenever you like.';
  return event.message;
}

function getWalletResultLabel(wallet: BigSpenderWallet) {
  if (wallet.state !== 'revealed') return null;
  if (wallet.outcome.type === 'bomb') return 'Bomb';
  const amount = wallet.outcome.amount ?? 0;
  if (amount > 0) return `+${amount}`;
  return `${amount}`;
}

function chooseAiWallet(state: BigSpenderState, playerId: string, rng: () => number) {
  const available = getBigSpenderBoardForPlayer(state, playerId).filter((wallet) => wallet.state === 'hidden');
  return available[Math.floor(rng() * available.length)] ?? available[0] ?? null;
}

export default function BigSpender(props: GenericMinigameProps) {
  const participants = useMemo(
    () => resolveBigSpenderParticipants(props.participants, props.participantIds),
    [props.participants, props.participantIds],
  );
  const seed = props.seed || 73_337;
  const [state, setState] = useState(() => createInitialBigSpenderState(participants, seed));
  const [resultCommitted, setResultCommitted] = useState(false);
  const aiRngRef = useRef(mulberry32((seed ^ 0x5eedcafe) >>> 0));
  const aiTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const humanPlayer = useMemo(() => state.players.find((player) => player.isHuman) ?? null, [state.players]);
  const humanBoard = useMemo(
    () => humanPlayer ? getBigSpenderBoardForPlayer(state, humanPlayer.playerId) : state.board,
    [humanPlayer, state],
  );
  const playersById = useMemo(() => new Map(state.players.map((player) => [player.playerId, player])), [state.players]);
  const ranking = useMemo(() => rankBigSpenderPlayers(state.players), [state.players]);
  const winner = ranking[0] ?? null;
  const canHumanAct = Boolean(
    humanPlayer &&
    humanPlayer.status === 'active' &&
    state.status === 'running' &&
    state.pendingAdRescue?.playerId !== humanPlayer.playerId,
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
      if (!getBigSpenderBoardForPlayer(state, player.playerId).some((wallet) => wallet.state === 'hidden')) continue;
      const delay = getAiActionDelayMs(state.startingPlayerCount, aiRngRef.current);
      const timer = setTimeout(() => {
        aiTimersRef.current.delete(player.playerId);
        setState((previous) => {
          const actor = previous.players.find((entry) => entry.playerId === player.playerId);
          if (!actor || actor.isHuman || actor.status !== 'active') return previous;
          const shouldOpen = decideAiShouldOpen(actor.balance, aiRngRef.current);
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
    return () => {
      for (const timer of aiTimersRef.current.values()) {
        clearTimeout(timer);
      }
      aiTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'running') return;
    if (!humanPlayer || humanPlayer.status !== 'active') return;
    const hasHiddenWallets = humanBoard.some((wallet) => wallet.state === 'hidden');
    if (hasHiddenWallets) return;
    setState((previous) => {
      const actor = previous.players.find((player) => player.playerId === humanPlayer.playerId);
      if (
        previous.status !== 'running' ||
        !actor ||
        actor.status !== 'active' ||
        getBigSpenderBoardForPlayer(previous, actor.playerId).some((wallet) => wallet.state === 'hidden')
      ) {
        return previous;
      }
      return lockBigSpenderPlayer(previous, actor.playerId);
    });
  }, [humanBoard, humanPlayer, state.status]);

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
    <div className="big-spender" data-testid="big-spender-game">
      <header className="big-spender__header">
        <div className="big-spender__title-block">
          <span className="big-spender__eyebrow">Eyeoleans at risk</span>
          <h1>{BIG_SPENDER_DISPLAY_NAME}</h1>
        </div>
      </header>

      <section className="big-spender__status-panel" aria-live="polite">
        <div>
          <span className="big-spender__eyebrow">Live balance</span>
          <strong>{humanPlayer ? `${humanPlayer.balance} Eyeoleans` : 'Results'}</strong>
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
          {humanBoard.map((wallet) => {
            const opener = wallet.openedByPlayerId ? playersById.get(wallet.openedByPlayerId) : null;
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
                  <>
                    <strong className="big-spender__wallet-result">{resultLabel}</strong>
                    <span className="big-spender__wallet-opener">{opener?.displayName ?? 'Opened'}</span>
                  </>
                ) : (
                  <span className="big-spender__wallet-generation">Tap</span>
                )}
              </button>
            );
          })}
        </section>

        <aside className="big-spender__players" aria-label="Player balances">
          {state.players.map((player) => (
            <article
              key={player.playerId}
              className={[
                'big-spender__player',
                player.isHuman ? 'big-spender__player--human' : '',
                `big-spender__player--${player.status}`,
              ].join(' ')}
            >
              <span className="big-spender__avatar" aria-hidden="true">
                {isImageAvatar(player.avatar) ? (
                  <img src={player.avatar} alt="" />
                ) : (
                  player.avatar || getInitials(player.displayName)
                )}
              </span>
              <div className="big-spender__player-copy">
                <strong>{player.displayName}</strong>
                <span>{getPlayerLabel(player)} - {player.walletsOpened} wallets</span>
              </div>
              {player.isHuman ? (
                <data value={player.balance}>{player.balance}</data>
              ) : (
                <span className="big-spender__score-hidden" aria-label="Score hidden">Hidden</span>
              )}
            </article>
          ))}
        </aside>
      </main>

      {state.status === 'running' && (
        <footer className="big-spender__actions">
          <button type="button" className="big-spender__action big-spender__action--lock" onClick={lockHuman} disabled={!canHumanAct}>
            Lock in
          </button>
          <span>{canHumanAct ? 'Open wallets while the house plays live.' : 'Your run is locked.'}</span>
        </footer>
      )}

      <section className="big-spender__broadcasts" aria-label="House broadcasts" aria-live="polite">
        {state.events
          .filter((entry) => entry.type === 'walletOpened' || entry.type === 'playerLocked' || entry.type === 'playerBombed' || entry.type === 'playerZeroFinished')
          .slice(0, 4)
          .map((entry, index) => (
            <p key={`${entry.type}-${entry.playerId ?? 'house'}-${index}`}>{entry.message}</p>
          ))}
      </section>

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
                  <em>{player.isHuman ? `${player.balance} Eyeoleans` : 'Score hidden'} - {getPlayerLabel(player)}</em>
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
