/**
 * TrapAuction.tsx
 *
 * Mobile-first, portrait-oriented "Trap Auction" minigame.
 *
 * Phases: intro → bid → reveal → elimination → complete
 *
 * Human interactions:
 *  - bid:         Choose bid amount via slider; confirm with button.
 *  - reveal:      Watch staged card flips; tap "Reveal Next" or "Reveal All".
 *  - elimination: See eliminated player(s) fade out, then auto-advance.
 *  - complete:    See winner; tap to finish.
 *  - If human eliminated: choose "Watch as Spectator" or "Skip to Results".
 *
 * Integration:
 *  - Receives `participants` + `seed` + `prizeType` + `onComplete` from MinigameHost.
 *  - Falls back to MOCK_PARTICIPANTS when used standalone.
 *  - Calls onComplete({ authoritativeWinnerId }) on game over.
 *
 * TODO: Wire in sound effects at the TODO_SOUND markers below.
 * TODO: Wire in cinematic overlay components at the TODO_OVERLAY markers below.
 */

import { useReducer, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { trapAuctionReducer } from './trapAuctionReducer';
import type { TrapAuctionState, TrapAuctionPlayer, TrapAuctionPrizeType } from './trapAuctionTypes';
import {
  TRAP_AUCTION_CONFIG,
  PERSONALITY_DESCRIPTIONS,
  PERSONALITY_LABELS,
  PERSONALITY_ICONS,
} from './trapAuctionTypes';
import {
  createInitialPlayers,
  getAllowedBidRange,
  MOCK_PARTICIPANTS,
  shouldRevealPlayerBank,
} from './trapAuctionHelpers';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import { resolveAvatarCandidates } from '../../utils/avatar';
import { resolvePresentationAvatar } from '../../utils/presentationAvatar';
import './TrapAuction.css';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TrapAuctionProps {
  participants?: MinigameParticipant[];
  participantIds?: string[];
  prizeType?: TrapAuctionPrizeType;
  seed?: number;
  onComplete?: (completion: ReactMinigameCompletion) => void;
  /** Standalone / challenge mode fallback */
  onFinish?: (value: number) => void;
  autoStart?: boolean;
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function resolvePlayerAvatarSrc(player: TrapAuctionPlayer): string {
  const candidates = resolveAvatarCandidates({ id: player.id, name: player.name, avatar: player.avatar }).map(resolvePresentationAvatar);
  return candidates[0] ?? '';
}

// ─── AvatarImg sub-component ─────────────────────────────────────────────────

interface AvatarImgProps {
  player: TrapAuctionPlayer;
  className?: string;
}

function AvatarImg({ player, className = '' }: AvatarImgProps) {
  const [src, setSrc] = useState(() => resolvePlayerAvatarSrc(player));
  const [failed, setFailed] = useState(false);

  function handleError() {
    if (!failed) {
      setSrc(`https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(player.name)}`);
      setFailed(true);
    }
  }

  if (failed && src.includes('dicebear')) {
    return (
      <div className={`ta-avatar-fallback ${className}`} aria-label={player.name}>
        {player.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      className={`ta-avatar-img ${className}`}
      src={src}
      alt={player.name}
      onError={handleError}
    />
  );
}

// ─── Initial state builder ────────────────────────────────────────────────────

function buildInitialState(
  participants: MinigameParticipant[],
  seed: number,
  prizeType: TrapAuctionPrizeType,
): TrapAuctionState {
  const players = createInitialPlayers(participants, seed);
  return {
    phase: 'intro',
    round: 1,
    players,
    roundReveals: [],
    revealIndex: 0,
    lastEliminatedIds: [],
    lastHighestBidderId: null,
    winner: null,
    humanEliminated: false,
    spectating: false,
    fastForward: false,
    prizeType,
    seed,
    rematchCount: 0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrapAuction({
  participants,
  prizeType = 'LOH',
  seed = 42,
  onComplete,
  onFinish,
  autoStart = false,
}: TrapAuctionProps) {
  const resolvedParticipants = participants && participants.length > 0
    ? participants
    : MOCK_PARTICIPANTS;

  const [state, dispatch] = useReducer(
    trapAuctionReducer,
    { resolvedParticipants, seed, prizeType },
    ({ resolvedParticipants, seed, prizeType }) =>
      buildInitialState(resolvedParticipants, seed, prizeType),
  );
  const [bidValue, setBidValue] = useState<number>(0);
  const [personalityMapOpen, setPersonalityMapOpen] = useState(false);
  const [showSpectatePrompt, setShowSpectatePrompt] = useState(false);
  const autoRevealRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise bid slider to recommended value when bid phase begins
  useEffect(() => {
    if (state.phase !== 'bid') return;
    const human = state.players.find((p) => p.isHuman && p.isAlive);
    if (!human) return;
    const { recommended } = getAllowedBidRange(human, state.round);
    setBidValue(recommended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round]);

  // Auto-advance reveal cards — always timed; no manual flip controls
  useEffect(() => {
    if (state.phase !== 'reveal') return;
    const remaining = state.roundReveals.length - state.revealIndex;
    if (remaining <= 0) return;

    const delay = state.fastForward
      ? TRAP_AUCTION_CONFIG.fastRevealStepMs
      : TRAP_AUCTION_CONFIG.revealStepMs;

    autoRevealRef.current = setTimeout(() => {
      dispatch({ type: 'ADVANCE_REVEAL' });
    }, delay);

    return () => {
      if (autoRevealRef.current !== null) {
        clearTimeout(autoRevealRef.current);
        autoRevealRef.current = null;
      }
    };
  }, [state.phase, state.revealIndex, state.fastForward, state.roundReveals.length]);

  // Auto-advance when all reveal cards are visible
  useEffect(() => {
    if (state.phase !== 'reveal') return;
    if (state.revealIndex < state.roundReveals.length) return;

    const delay = state.fastForward ? 500 : 900;
    const t = setTimeout(() => {
      dispatch({ type: 'ADVANCE_TO_ELIMINATION' });
    }, delay);
    return () => clearTimeout(t);
  }, [state.phase, state.revealIndex, state.roundReveals.length, state.fastForward]);

  // Auto-advance the elimination cinematic unless the human needs a spectate choice
  useEffect(() => {
    if (state.phase !== 'elimination') return;
    const humanEliminatedThisRound = state.lastEliminatedIds.some((id) =>
      state.players.find((p) => p.id === id)?.isHuman,
    );
    if (humanEliminatedThisRound && !state.spectating) return;

    const delay = state.fastForward ? 700 : TRAP_AUCTION_CONFIG.eliminationPauseMs;
    const t = setTimeout(() => {
      dispatch({ type: 'CONTINUE_AFTER_ELIMINATION' });
    }, delay);
    return () => clearTimeout(t);
  }, [state.phase, state.fastForward, state.lastEliminatedIds, state.players, state.spectating]);

  // Auto-advance spectator bid phase
  useEffect(() => {
    if (!state.spectating || state.phase !== 'bid') return;
    // In spectator mode, auto-submit a dummy bid for the human slot so the
    // round can proceed (human is already eliminated, this triggers AI bids)
    const t = setTimeout(() => {
      dispatch({ type: 'SUBMIT_HUMAN_BID', bid: 0 });
    }, state.fastForward ? 300 : 1200);
    return () => clearTimeout(t);
  }, [state.phase, state.spectating, state.round, state.fastForward]);

  // When game completes, show spectate prompt if applicable, else fire onComplete
  useEffect(() => {
    if (state.phase !== 'complete') return;
    // nothing — handled by the complete screen render
  }, [state.phase]);

  // Show spectate prompt when human gets eliminated (phase = elimination, humanEliminated)
  const lastEliminatedIds = state.lastEliminatedIds;
  const players = state.players;
  useEffect(() => {
    if (
      state.phase === 'elimination' &&
      state.humanEliminated &&
      !state.spectating &&
      lastEliminatedIds.some((id) =>
        players.find((p) => p.id === id)?.isHuman,
      )
    ) {
      const t = setTimeout(() => setShowSpectatePrompt(true), 1200);
      return () => clearTimeout(t);
    } else {
      setShowSpectatePrompt(false);
    }
  }, [state.phase, state.humanEliminated, state.spectating, lastEliminatedIds, players]);

  // autoStart: skip intro
  useEffect(() => {
    if (autoStart && state.phase === 'intro') {
      dispatch({ type: 'START_BID' });
    }
  }, [autoStart, state.phase]);

  function handleGameComplete() {
    if (!state.winner) return;
    if (onComplete) {
      const ordered = [...state.players].sort(
        (a, b) => (a.placement ?? Number.MAX_SAFE_INTEGER) - (b.placement ?? Number.MAX_SAFE_INTEGER),
      );
      const lastPlaceId = ordered[ordered.length - 1]?.id ?? null;
      const playerCount = ordered.length;
      onComplete({
        authoritativeWinnerId: state.winner.id,
        authoritativeLastPlaceId: lastPlaceId,
        rawResults: Object.fromEntries(
          ordered.map((player) => [
            player.id,
            playerCount - (player.placement ?? playerCount) + 1,
          ]),
        ),
      });
    } else if (onFinish) {
      onFinish(1);
    }
  }

  const alivePlayers = state.players.filter((p) => p.isAlive);
  const humanPlayer = state.players.find((p) => p.isHuman);

  // ── Render by phase ─────────────────────────────────────────────────────────

  return (
    <div className="ta-root">
      {/* ── Header ── */}
      <header className="ta-header">
        <div className="ta-header__round">
          Round <span className="ta-header__round-num">{state.round}</span>
        </div>
        <div className="ta-header__title">Trap Auction</div>
        <div className="ta-header__alive">
          <span className="ta-header__alive-icon">👥</span>
          {alivePlayers.length} alive
        </div>
      </header>

      {/* ── Fast-forward toggle ── */}
      <div className="ta-ff-bar">
        <button
          className={`ta-ff-btn ${state.fastForward ? 'ta-ff-btn--on' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_FAST_FORWARD' })}
          aria-label="Toggle fast-forward"
          type="button"
        >
          {state.fastForward ? '⏩ Fast' : '▶ Normal'}
        </button>
        {state.phase === 'bid' && !state.spectating && (
          <button
            className="ta-personality-btn"
            onClick={() => setPersonalityMapOpen(true)}
            aria-label="Open personality map"
            type="button"
          >
            🗺️ Player Profiles
          </button>
        )}
      </div>

      {/* ── Phase content ── */}
      <main className={`ta-main ${state.phase === 'reveal' ? 'ta-main--reveal' : ''}`}>
        {state.phase === 'intro' && renderIntro()}
        {state.phase === 'bid' && renderBid()}
        {state.phase === 'reveal' && renderReveal()}
        {state.phase === 'elimination' && renderElimination()}
        {state.phase === 'complete' && renderComplete()}
      </main>

      {/* ── Personality Map modal ── */}
      {personalityMapOpen && (
        <PersonalityMapModal
          players={state.players}
          round={state.round}
          onClose={() => setPersonalityMapOpen(false)}
        />
      )}
    </div>
  );

  // ─── Phase renderers ─────────────────────────────────────────────────────────

  function renderIntro(): ReactNode {
    return (
      <div className="ta-intro">
        <div className="ta-intro__icon">🏷️</div>
        <h2 className="ta-intro__title">Trap Auction</h2>
        <p className="ta-intro__tagline">Bid to survive. The cheapest player pays the price.</p>
        <ul className="ta-intro__rules">
          <li>Every player secretly bids <strong>Eyeolens</strong> each round.</li>
          <li>The <span className="ta-text--danger">lowest bidder</span> is eliminated.</li>
          <li>The <span className="ta-text--warning">highest bidder</span> is exposed.</li>
          <li>All players pay what they bid from their bank.</li>
          <li>Last one standing wins.</li>
        </ul>
        <div className="ta-intro__bank-note">
          Everyone starts with <strong>{TRAP_AUCTION_CONFIG.startingBank} 👁 Eyeolens</strong>
        </div>
        <button
          className="ta-btn ta-btn--primary ta-btn--lg"
          onClick={() => dispatch({ type: 'START_BID' })}
          type="button"
        >
          Let's Auction
        </button>
      </div>
    );
  }

  function renderBid(): ReactNode {
    if (state.spectating) {
      return (
        <div className="ta-spectator-waiting">
          <div className="ta-spectator-waiting__icon">👁</div>
          <p className="ta-spectator-waiting__text">Waiting for bids…</p>
          {renderPlayerGrid(state.players, false)}
        </div>
      );
    }

    const human = humanPlayer;
    if (!human || !human.isAlive) {
      // Human is eliminated but not yet spectating — handled by spectate prompt
      return null;
    }

    const range = getAllowedBidRange(human, state.round);

    return (
      <div className="ta-bid-phase">
        {/* Rematch notice — shown when the previous round was a complete tie */}
        {(state.rematchCount ?? 0) > 0 && (
          <div className="ta-rematch-banner" role="status">
            🔁 It's a tie! Everyone bid the same — rematch! Bid again to settle it.
          </div>
        )}

        {/* Player grid (compact) */}
        {renderPlayerGrid(state.players, true)}

        {/* Human bid control */}
        <div className="ta-bid-control">
          <div className="ta-bid-control__bank">
            <span className="ta-bid-control__bank-label">Your Bank</span>
            <span className="ta-bid-control__bank-amount">
              {human.bank} <span className="ta-eyeolens">👁</span>
            </span>
          </div>

          <div className="ta-bid-control__label">
            Your bid: <strong>{bidValue}</strong> 👁
          </div>

          <input
            type="range"
            className="ta-bid-slider"
            min={range.min}
            max={range.max}
            value={bidValue}
            onChange={(e) => setBidValue(Number(e.target.value))}
            aria-label={`Bid amount: ${bidValue} Eyeolens`}
          />

          <div className="ta-bid-control__range">
            <span>{range.min} min</span>
            <span>{range.max} max</span>
          </div>

          <div className="ta-bid-stepper">
            <button
              className="ta-btn ta-btn--ghost ta-btn--sm"
              onClick={() => setBidValue((v) => Math.max(range.min, v - 5))}
              type="button"
              aria-label="Decrease bid by 5"
            >−5</button>
            <button
              className="ta-btn ta-btn--ghost ta-btn--sm"
              onClick={() => setBidValue((v) => Math.max(range.min, v - 1))}
              type="button"
              aria-label="Decrease bid by 1"
            >−1</button>
            <span className="ta-bid-stepper__val">{bidValue}</span>
            <button
              className="ta-btn ta-btn--ghost ta-btn--sm"
              onClick={() => setBidValue((v) => Math.min(range.max, v + 1))}
              type="button"
              aria-label="Increase bid by 1"
            >+1</button>
            <button
              className="ta-btn ta-btn--ghost ta-btn--sm"
              onClick={() => setBidValue((v) => Math.min(range.max, v + 5))}
              type="button"
              aria-label="Increase bid by 5"
            >+5</button>
          </div>

          <button
            className="ta-btn ta-btn--primary ta-btn--lg ta-bid-control__confirm"
            onClick={() => dispatch({ type: 'SUBMIT_HUMAN_BID', bid: bidValue })}
            type="button"
          >
            Lock In {bidValue} 👁
          </button>
        </div>
      </div>
    );
  }

  function renderReveal(): ReactNode {
    const allRevealed = state.revealIndex >= state.roundReveals.length;

    return (
      <div className="ta-reveal-phase">
        <h3 className="ta-reveal-phase__title">The Bids Are In…</h3>

        <div className="ta-reveal-cards">
          {state.roundReveals.map((reveal, idx) => {
            const player = state.players.find((p) => p.id === reveal.playerId);
            if (!player) return null;
            const isFlipped = reveal.revealed;

            let cardClass = 'ta-reveal-card';
            if (isFlipped && reveal.isLowest) cardClass += ' ta-reveal-card--lowest';
            if (isFlipped && reveal.isHighest) cardClass += ' ta-reveal-card--highest';
            if (!isFlipped) cardClass += ' ta-reveal-card--hidden';

            return (
              <div key={reveal.playerId} className={cardClass} aria-label={isFlipped ? `${player.name}: ${reveal.bid}` : 'Hidden bid'}>
                <div className="ta-reveal-card__inner">
                  {/* Card back */}
                  <div className="ta-reveal-card__back">
                    <span className="ta-reveal-card__back-icon">🏷️</span>
                  </div>
                  {/* Card front */}
                  <div className="ta-reveal-card__front">
                    <AvatarImg player={player} className="ta-reveal-card__avatar" />
                    <span className="ta-reveal-card__name">{player.name}</span>
                    <span className="ta-reveal-card__bid">{reveal.bid} 👁</span>
                    {reveal.isLowest && (
                      <span className="ta-reveal-card__badge ta-reveal-card__badge--out">
                        ❌ LOWEST
                      </span>
                    )}
                    {reveal.isHighest && (
                      <span className="ta-reveal-card__badge ta-reveal-card__badge--exposed">
                        ⚠️ EXPOSED
                      </span>
                    )}
                  </div>
                </div>
                {/* Reveal order indicator */}
                <span className="ta-reveal-card__order">{idx + 1}</span>
              </div>
            );
          })}
        </div>

        {allRevealed && (
          <div className="ta-reveal-auto-advance" aria-label="Continuing to elimination">
            <span className="ta-reveal-auto-advance__dot" />
            <span className="ta-reveal-auto-advance__dot" />
            <span className="ta-reveal-auto-advance__dot" />
          </div>
        )}
      </div>
    );
  }

  function renderElimination(): ReactNode {
    const eliminatedPlayers = state.players.filter((p) =>
      state.lastEliminatedIds.includes(p.id),
    );
    const humanEliminatedThisRound = state.lastEliminatedIds.some((id) =>
      state.players.find((p) => p.id === id)?.isHuman,
    );

    return (
      <div className="ta-elimination-phase">
        {/* TODO_OVERLAY: mount spotlight / cinematic overlay here */}
        <div className="ta-elimination-spotlight">
          {eliminatedPlayers.map((p) => (
            <div key={p.id} className="ta-elimination-card">
              <AvatarImg player={p} className="ta-elimination-card__avatar" />
              <span className="ta-elimination-card__name">{p.name}</span>
              <span className="ta-elimination-card__msg">Eliminated in Round {state.round}</span>
              {/* TODO_SOUND: play eviction sound here */}
            </div>
          ))}
        </div>

        <div className="ta-elimination-remaining">
          {alivePlayers.length} player{alivePlayers.length !== 1 ? 's' : ''} remain
        </div>

        {/* Spectate prompt for eliminated human */}
        {showSpectatePrompt && !state.spectating && (
          <div className="ta-spectate-prompt">
            <p className="ta-spectate-prompt__msg">You've been eliminated! What would you like to do?</p>
            <div className="ta-spectate-prompt__actions">
              <button
                className="ta-btn ta-btn--ghost"
                onClick={() => {
                  setShowSpectatePrompt(false);
                  dispatch({ type: 'SPECTATE' });
                  dispatch({ type: 'CONTINUE_AFTER_ELIMINATION' });
                }}
                type="button"
              >
                👁 Watch as Spectator
              </button>
              <button
                className="ta-btn ta-btn--danger"
                onClick={() => {
                  setShowSpectatePrompt(false);
                  dispatch({ type: 'SKIP_TO_RESULTS' });
                }}
                type="button"
              >
                ⏭ Skip to Results
              </button>
            </div>
          </div>
        )}

        {!showSpectatePrompt && !(humanEliminatedThisRound && !state.spectating) && (
          <div className="ta-reveal-auto-advance" aria-label="Advancing to the next round">
            <span className="ta-reveal-auto-advance__dot" />
            <span className="ta-reveal-auto-advance__dot" />
            <span className="ta-reveal-auto-advance__dot" />
          </div>
        )}
      </div>
    );
  }

  function renderComplete(): ReactNode {
    const { winner } = state;
    const sortedPlayers = [...state.players].sort(
      (a, b) => (a.placement ?? 999) - (b.placement ?? 999),
    );

    return (
      <div className="ta-complete-phase">
        {/* TODO_OVERLAY: mount winner celebration overlay */}
        {winner && (
          <div className="ta-complete-winner">
            <div className="ta-complete-winner__crown">🏆</div>
            <AvatarImg player={winner} className="ta-complete-winner__avatar" />
            <h2 className="ta-complete-winner__name">{winner.name}</h2>
            <p className="ta-complete-winner__sub">
              wins the {state.prizeType === 'LOH' ? '👑 Leader of the House' : '🛡️ Power of Safety'}
            </p>
            <p className="ta-complete-winner__bank">
              Ended with {winner.bank} 👁 Eyeolens
            </p>
            {/* TODO_SOUND: play winner fanfare sound */}
          </div>
        )}

        <div className="ta-complete-placements">
          <h3 className="ta-complete-placements__title">Final Standings</h3>
          <div className="ta-complete-placements__list">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className={`ta-complete-placement ${p.id === winner?.id ? 'ta-complete-placement--winner' : ''}`}
              >
                <span className="ta-complete-placement__rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${(p.placement ?? i + 1)}`}
                </span>
                <AvatarImg player={p} className="ta-complete-placement__avatar" />
                <span className="ta-complete-placement__name">{p.name}</span>
                <span className="ta-complete-placement__bank">{p.bank} 👁</span>
                {p.eliminatedRound && (
                  <span className="ta-complete-placement__elim">Round {p.eliminatedRound}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="ta-complete-actions">
          <button
            className="ta-btn ta-btn--primary ta-btn--lg"
            onClick={handleGameComplete}
            type="button"
          >
            Finish
          </button>
        </div>
      </div>
    );
  }

  // ─── Player grid (compact overview during bid + spectating) ────────────────

  function renderPlayerGrid(players: TrapAuctionPlayer[], compact: boolean): ReactNode {
    return (
        <div className={`ta-player-grid ${compact ? 'ta-player-grid--compact' : ''}`} role="list" aria-label="Players">
          {players.map((p) => (
            <div
            key={p.id}
            className={`ta-player-card ${!p.isAlive ? 'ta-player-card--eliminated' : ''} ${p.isHuman ? 'ta-player-card--human' : ''}`}
            role="listitem"
            aria-label={`${p.name}${!p.isAlive ? ' (eliminated)' : ''}`}
            >
              <AvatarImg player={p} className="ta-player-card__avatar" />
              <span className="ta-player-card__name">{p.name}</span>
              {shouldRevealPlayerBank(p, state.round) ? (
                <span className="ta-player-card__bank">{p.bank} 👁</span>
              ) : (
                <span className="ta-player-card__bank ta-player-card__bank--hidden">Hidden</span>
              )}
              {!p.isAlive && (
                <span className="ta-player-card__eliminated-badge">OUT</span>
              )}
            {p.isHuman && p.isAlive && (
              <span className="ta-player-card__you">YOU</span>
            )}
          </div>
        ))}
      </div>
    );
  }
}

// ─── PersonalityMapModal ──────────────────────────────────────────────────────

interface PersonalityMapModalProps {
  players: TrapAuctionPlayer[];
  round: number;
  onClose: () => void;
}

function PersonalityMapModal({ players, round, onClose }: PersonalityMapModalProps) {
  const others = players.filter((p) => !p.isHuman);

  return (
    <div className="ta-pm-backdrop" role="dialog" aria-label="Player Profiles" aria-modal="true">
      <div className="ta-pm">
        <div className="ta-pm__header">
          <h3 className="ta-pm__title">🗺️ Player Profiles</h3>
          <p className="ta-pm__subtitle">Know your competition's tendencies</p>
          <button
            className="ta-pm__close"
            onClick={onClose}
            aria-label="Close personality map"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="ta-pm__cards">
          {others.map((p) => (
            <div key={p.id} className={`ta-pm-card ${!p.isAlive ? 'ta-pm-card--eliminated' : ''}`}>
              <div className="ta-pm-card__header">
                <AvatarImg player={p} className="ta-pm-card__avatar" />
                <div className="ta-pm-card__identity">
                  <strong className="ta-pm-card__name">{p.name}</strong>
                  {!p.isAlive && (
                    <span className="ta-pm-card__status ta-pm-card__status--out">Eliminated R{p.eliminatedRound}</span>
                  )}
                  {p.isAlive && p.isExposed && (
                    <span className="ta-pm-card__status ta-pm-card__status--exposed">⚠️ Exposed</span>
                  )}
                </div>
              </div>

              <div className="ta-pm-card__personality">
                <span className="ta-pm-card__personality-icon">
                  {PERSONALITY_ICONS[p.personality]}
                </span>
                <span className="ta-pm-card__personality-label">
                  {PERSONALITY_LABELS[p.personality]}
                </span>
              </div>

              <p className="ta-pm-card__desc">
                {PERSONALITY_DESCRIPTIONS[p.personality]}
              </p>

              <div className="ta-pm-card__stats">
                <span className="ta-pm-card__stats-item">
                  💰 Bank: {shouldRevealPlayerBank(p, round) ? `${p.bank} 👁` : 'Hidden'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="ta-pm__note">
          Profiles reflect each player's general tendencies — not a guarantee of their next bid.
        </p>
      </div>
    </div>
  );
}
