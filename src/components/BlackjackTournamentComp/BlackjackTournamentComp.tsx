/**
 * BlackjackTournamentComp — "Blackjack Tournament" last-player-standing competition.
 *
 * Tournament flow:
 *   spin         — Wheel animation selects the first controller.
 *   pick_opponent — Controller (human or AI) picks an opponent.
 *   duel          — Both players take turns hitting or standing.
 *   duel_result   — Short result beat showing winner/eliminated player.
 *   complete      — Final winner announced; onComplete fires.
 *
 * Human flow:
 *   - Spin phase: watch the spinner reveal the starting controller.
 *   - Pick phase: if human is in control, tap an opponent avatar to select.
 *   - Duel phase: if human is in the duel, use Hit / Stand buttons.
 *   - If eliminated: spectator mode with auto-advance.
 *
 * AI flow:
 *   - Opponent picks: auto-selected after a brief delay.
 *   - Duel actions: auto-decided using aiShouldHit + aiDecisionRng.
 *   - All AI timers are cleaned up on unmount / phase change.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initBlackjackTournament,
  resolveSpinner,
  pickOpponent,
  hitCurrentPlayer,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  resetBlackjackTournament,
  computeTotal,
  cardRank,
  cardSuit,
  aiPickOpponent,
  aiShouldHit,
  aiDecisionRng,
} from '../../features/blackjackTournament/blackjackTournamentSlice';
import type { BlackjackTournamentCompetitionType } from '../../features/blackjackTournament/blackjackTournamentSlice';
import { resolveBlackjackTournamentOutcome } from '../../features/blackjackTournament/thunks';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import HOUSEGUESTS from '../../data/houseguests';
import './BlackjackTournamentComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Duration of the spinner animation (ms). */
const SPIN_DURATION_MS = 2_400;
/** Pause on duel result before advancing (ms). */
const RESULT_HOLD_MS = 2_200;
/** Delay before AI auto-picks opponent (ms). */
const AI_PICK_DELAY_MS = 1_400;
/** Delay between successive AI hit/stand decisions (ms). */
const AI_ACTION_DELAY_MS = 900;
/** Auto-advance delay after winner screen (ms). */
const WINNER_AUTO_ADVANCE_MS = 2_500;
/** Spectator auto-advance delay per AI action (ms). */
const SPECTATOR_ADVANCE_MS = 600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarForId(id: string): string {
  const hg = HOUSEGUESTS.find((h) => h.id === id);
  if (hg) return resolveAvatar({ id: hg.id, name: hg.name, avatar: '' });
  return getDicebear(id);
}

function displayName(id: string, participants?: Array<{ id: string; name: string }>): string {
  const part = participants?.find((p) => p.id === id);
  if (part) return part.name;
  const hg = HOUSEGUESTS.find((h) => h.id === id);
  return hg?.name ?? id;
}

/** Returns true if the card should render in red (hearts/diamonds suit by index). */
function isRedCard(card: number, cardIndex: number): boolean {
  // Ace (1) always renders in red; for other cards, even suit indices (♥, ♦) are red.
  // Suit is determined by card position index mod 4: 0=♠(black), 1=♥(red), 2=♦(red), 3=♣(black).
  if (card === 1) return true;
  const suit = cardIndex % 4;
  return suit === 1 || suit === 2;
}

/** Card display helper — renders rank + suit in a small chip. */
function renderCards(cards: number[], bust: boolean, stood: boolean): React.ReactNode {
  return (
    <div className="bjt-cards" aria-label={`Cards totalling ${computeTotal(cards)}${bust ? ', busted' : ''}`}>
      {cards.map((c, i) => (
        <span
          key={i}
          className={`bjt-card ${isRedCard(c, i) ? 'bjt-card--red' : ''}`}
          aria-hidden="true"
        >
          {cardRank(c)}
          {cardSuit(i)}
        </span>
      ))}
      <span className="bjt-hand-total">
        {bust ? '💥 BUST' : stood ? `${computeTotal(cards)} ✋` : computeTotal(cards)}
      </span>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType: BlackjackTournamentCompetitionType;
  seed: number;
  onComplete?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BlackjackTournamentComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const bt = useAppSelector((s: RootState) => s.blackjackTournament);

  // Stable refs for timer cleanup.
  const spinTimerRef = useRef<number | null>(null);
  const aiPickTimerRef = useRef<number | null>(null);
  const aiActionTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const winnerTimerRef = useRef<number | null>(null);
  const spectatorTimerRef = useRef<number | null>(null);

  // Spinner display state (locally animated).
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const spinnerIntervalRef = useRef<number | null>(null);

  function clearTimer(ref: React.MutableRefObject<number | null>) {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  }

  function clearAllTimers() {
    clearTimer(spinTimerRef);
    clearTimer(aiPickTimerRef);
    clearTimer(aiActionTimerRef);
    clearTimer(resultTimerRef);
    clearTimer(winnerTimerRef);
    clearTimer(spectatorTimerRef);
    if (spinnerIntervalRef.current !== null) { window.clearInterval(spinnerIntervalRef.current); spinnerIntervalRef.current = null; }
  }

  const isHuman = useCallback(
    (id: string) => {
      const part = participants?.find((p) => p.id === id);
      if (part) return part.isHuman;
      return id === bt.humanPlayerId;
    },
    [participants, bt.humanPlayerId],
  );

  const getName = useCallback(
    (id: string) => displayName(id, participants),
    [participants],
  );

  // Capture init params once so the init effect doesn't re-fire on prop changes.
  const initParamsRef = useRef({ participantIds, prizeType, seed });

  // ── 1. Initialise on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const { participantIds: pIds, prizeType: pt, seed: s } = initParamsRef.current;
    const humanPart = participants?.find((p) => p.isHuman);
    const humanPlayerId = humanPart?.id ?? null;

    dispatch(
      initBlackjackTournament({
        participantIds: pIds,
        competitionType: pt,
        seed: s,
        humanPlayerId,
      }),
    );
    return () => {
      clearAllTimers();
      dispatch(resetBlackjackTournament());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // ── 2. Resolve outcome when complete ──────────────────────────────────────
  useEffect(() => {
    if (bt.phase === 'complete' && !bt.outcomeResolved) {
      dispatch(resolveBlackjackTournamentOutcome());
    }
  }, [bt.phase, bt.outcomeResolved, dispatch]);

  // ── 3. Auto-advance winner screen ─────────────────────────────────────────
  useEffect(() => {
    if (bt.phase !== 'complete') return;
    if (winnerTimerRef.current !== null) return;
    winnerTimerRef.current = window.setTimeout(() => {
      onComplete?.();
    }, WINNER_AUTO_ADVANCE_MS);
    return () => { clearTimer(winnerTimerRef); };
  }, [bt.phase, onComplete]);

  // ── 4. Spin phase: run spinner animation then resolve ─────────────────────
  useEffect(() => {
    if (bt.phase !== 'spin') return;
    const len = bt.remainingPlayerIds.length;
    if (len === 0) return;

    // Animate spinner by cycling through player indices.
    spinnerIntervalRef.current = window.setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % len);
    }, 180);

    spinTimerRef.current = window.setTimeout(() => {
      if (spinnerIntervalRef.current !== null) {
        window.clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }
      dispatch(resolveSpinner());
    }, SPIN_DURATION_MS);

    return () => {
      if (spinnerIntervalRef.current !== null) {
        window.clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }
      clearTimer(spinTimerRef);
    };
  }, [bt.phase, bt.remainingPlayerIds.length, dispatch]);

  // ── 5. Pick-opponent phase ────────────────────────────────────────────────
  useEffect(() => {
    if (bt.phase !== 'pick_opponent') return;
    if (!bt.controllingPlayerId) return;

    // If only one opponent remains, auto-select immediately.
    if (bt.selectedOpponentId !== null) {
      aiPickTimerRef.current = window.setTimeout(() => {
        dispatch(pickOpponent({ opponentId: bt.selectedOpponentId! }));
      }, 600);
      return () => { clearTimer(aiPickTimerRef); };
    }

    // AI controller: auto-pick after delay.
    if (!isHuman(bt.controllingPlayerId)) {
      aiPickTimerRef.current = window.setTimeout(() => {
        const chosen = aiPickOpponent(
          bt.seed,
          bt.duelIndex,
          bt.controllingPlayerId!,
          bt.remainingPlayerIds,
        );
        if (chosen) dispatch(pickOpponent({ opponentId: chosen }));
      }, AI_PICK_DELAY_MS);
      return () => { clearTimer(aiPickTimerRef); };
    }
  }, [
    bt.phase,
    bt.controllingPlayerId,
    bt.selectedOpponentId,
    bt.duelIndex,
    bt.remainingPlayerIds,
    bt.seed,
    dispatch,
    isHuman,
  ]);

  // ── 6. Duel phase: AI auto-act and duel resolution ────────────────────────
  useEffect(() => {
    if (bt.phase !== 'duel' || !bt.currentDuel) return;
    const duel = bt.currentDuel;

    if (duel.duelTurn === 'finished') {
      // Both players done; resolve the duel.
      aiActionTimerRef.current = window.setTimeout(() => {
        dispatch(resolveDuel());
      }, 300);
      return () => { clearTimer(aiActionTimerRef); };
    }

    const activeId = duel.duelTurn === 'controller' ? duel.controllerId : duel.opponentId;
    const activeCards = duel.duelTurn === 'controller' ? duel.controllerCards : duel.opponentCards;
    const decisionIndex = activeCards.length - 2; // 0 for first decision

    // Human active player: wait for button press, no timer needed.
    if (isHuman(activeId)) return;

    // AI active player: auto-decide after a short delay.
    const rngVal = aiDecisionRng(bt.seed, bt.duelIndex, activeId, decisionIndex);
    const shouldHit = aiShouldHit(computeTotal(activeCards), rngVal);

    const delay = bt.isSpectating ? SPECTATOR_ADVANCE_MS : AI_ACTION_DELAY_MS;
    aiActionTimerRef.current = window.setTimeout(() => {
      if (shouldHit) {
        dispatch(hitCurrentPlayer());
      } else {
        dispatch(standCurrentPlayer());
      }
    }, delay);

    return () => { clearTimer(aiActionTimerRef); };
  }, [
    bt.phase,
    bt.currentDuel,
    bt.seed,
    bt.duelIndex,
    bt.isSpectating,
    dispatch,
    isHuman,
  ]);

  // ── 7. Duel result phase: hold then advance ───────────────────────────────
  useEffect(() => {
    if (bt.phase !== 'duel_result') return;
    const delay = bt.isSpectating ? SPECTATOR_ADVANCE_MS : RESULT_HOLD_MS;
    resultTimerRef.current = window.setTimeout(() => {
      dispatch(advanceFromDuelResult());
    }, delay);
    return () => { clearTimer(resultTimerRef); };
  }, [bt.phase, bt.isSpectating, dispatch]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const { phase } = bt;

  // ── Spin phase ────────────────────────────────────────────────────────────
  if (phase === 'spin') {
    const spinning = bt.remainingPlayerIds[spinnerIdx % bt.remainingPlayerIds.length];
    return (
      <div className="bjt-container bjt-spin" role="status" aria-live="polite">
        <h2 className="bjt-title">🎰 Blackjack Tournament</h2>
        <p className="bjt-subtitle">Spinning to pick the first controller…</p>
        <div className="bjt-spinner" aria-label="Spinner">
          <div className="bjt-spinner-track">
            {bt.remainingPlayerIds.map((id, i) => (
              <div
                key={id}
                className={`bjt-spinner-slot ${i === spinnerIdx % bt.remainingPlayerIds.length ? 'bjt-spinner-slot--active' : ''}`}
              >
                <img
                  src={avatarForId(id)}
                  alt={getName(id)}
                  className="bjt-avatar bjt-avatar--sm"
                  onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(id); }}
                />
                <span className="bjt-name">{getName(id)}</span>
              </div>
            ))}
          </div>
          <div className="bjt-spinner-pointer" aria-hidden="true">▼</div>
          {spinning && (
            <div className="bjt-spinner-highlight" aria-hidden="true">
              {getName(spinning)}
            </div>
          )}
        </div>
        <p className="bjt-remaining">
          {bt.remainingPlayerIds.length} players competing
        </p>
      </div>
    );
  }

  // ── Pick-opponent phase ───────────────────────────────────────────────────
  if (phase === 'pick_opponent') {
    const controllerId = bt.controllingPlayerId ?? '';
    const humanIsController = isHuman(controllerId);
    const opponents = bt.remainingPlayerIds.filter((id) => id !== controllerId);

    return (
      <div className="bjt-container bjt-pick" role="main">
        <div className="bjt-players-remaining" role="status" aria-live="polite">
          <span className="bjt-badge">{bt.remainingPlayerIds.length} remaining</span>
          {bt.eliminatedPlayerIds.length > 0 && (
            <span className="bjt-eliminated-list">
              Eliminated: {bt.eliminatedPlayerIds.map((id) => getName(id)).join(', ')}
            </span>
          )}
        </div>
        <h2 className="bjt-title">
          🃏{' '}
          <img
            src={avatarForId(controllerId)}
            alt={getName(controllerId)}
            className="bjt-avatar bjt-avatar--inline"
            onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(controllerId); }}
          />{' '}
          {getName(controllerId)}{humanIsController ? ' (you)' : ''} is in control
        </h2>
        <p className="bjt-subtitle">
          {humanIsController ? 'Pick your opponent:' : 'Choosing an opponent…'}
        </p>
        <div className="bjt-opponent-grid" role="list">
          {opponents.map((id) => (
            <button
              key={id}
              className={`bjt-opponent-btn ${!humanIsController ? 'bjt-opponent-btn--disabled' : ''}`}
              onClick={() => {
                if (humanIsController) dispatch(pickOpponent({ opponentId: id }));
              }}
              disabled={!humanIsController}
              aria-label={`Challenge ${getName(id)}`}
              role="listitem"
            >
              <img
                src={avatarForId(id)}
                alt={getName(id)}
                className="bjt-avatar bjt-avatar--lg"
                onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(id); }}
              />
              <span className="bjt-name">{getName(id)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Duel phase ────────────────────────────────────────────────────────────
  if (phase === 'duel' && bt.currentDuel) {
    const duel = bt.currentDuel;
    const cName = getName(duel.controllerId);
    const oName = getName(duel.opponentId);
    const humanInDuel = isHuman(duel.controllerId) || isHuman(duel.opponentId);
    const humanTurn =
      (duel.duelTurn === 'controller' && isHuman(duel.controllerId)) ||
      (duel.duelTurn === 'opponent' && isHuman(duel.opponentId));

    const activeId = duel.duelTurn === 'controller' ? duel.controllerId : duel.duelTurn === 'opponent' ? duel.opponentId : null;
    const activeName = activeId ? getName(activeId) : '';

    return (
      <div className="bjt-container bjt-duel" role="main">
        <h2 className="bjt-title">⚔️ Duel: {cName} vs {oName}</h2>

        <div className="bjt-duel-arena" aria-label="Blackjack duel arena">
          {/* Controller */}
          <div className={`bjt-duelist ${duel.duelTurn === 'controller' && !duel.controllerStood && !duel.controllerBust ? 'bjt-duelist--active' : ''} ${duel.controllerBust ? 'bjt-duelist--bust' : ''}`}>
            <img
              src={avatarForId(duel.controllerId)}
              alt={cName}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.controllerId); }}
            />
            <div className="bjt-duelist-name">
              {cName}
              {isHuman(duel.controllerId) && <span className="bjt-you-badge"> (you)</span>}
            </div>
            {renderCards(duel.controllerCards, duel.controllerBust, duel.controllerStood)}
          </div>

          <div className="bjt-vs" aria-hidden="true">VS</div>

          {/* Opponent */}
          <div className={`bjt-duelist ${duel.duelTurn === 'opponent' && !duel.opponentStood && !duel.opponentBust ? 'bjt-duelist--active' : ''} ${duel.opponentBust ? 'bjt-duelist--bust' : ''}`}>
            <img
              src={avatarForId(duel.opponentId)}
              alt={oName}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.opponentId); }}
            />
            <div className="bjt-duelist-name">
              {oName}
              {isHuman(duel.opponentId) && <span className="bjt-you-badge"> (you)</span>}
            </div>
            {renderCards(duel.opponentCards, duel.opponentBust, duel.opponentStood)}
          </div>
        </div>

        {duel.duelTurn !== 'finished' && (
          <p className="bjt-turn-label" role="status" aria-live="polite">
            {humanTurn
              ? `Your turn — hit or stand?`
              : `${activeName} is deciding…`}
          </p>
        )}

        {humanTurn && humanInDuel && (
          <div className="bjt-actions" role="group" aria-label="Duel actions">
            <button
              className="bjt-btn bjt-btn--hit"
              onClick={() => dispatch(hitCurrentPlayer())}
              aria-label="Hit — take another card"
            >
              Hit 🃏
            </button>
            <button
              className="bjt-btn bjt-btn--stand"
              onClick={() => dispatch(standCurrentPlayer())}
              aria-label="Stand — keep current hand"
            >
              Stand ✋
            </button>
          </div>
        )}

        {bt.isSpectating && duel.duelTurn !== 'finished' && (
          <p className="bjt-spectator-note" aria-live="polite">👁 Spectating…</p>
        )}
      </div>
    );
  }

  // ── Duel result phase ─────────────────────────────────────────────────────
  if (phase === 'duel_result' && bt.currentDuel) {
    const duel = bt.currentDuel;
    const winnerName = bt.duelWinnerId ? getName(bt.duelWinnerId) : '';
    const loserName = bt.duelLoserId ? getName(bt.duelLoserId) : '';

    return (
      <div className="bjt-container bjt-result" role="status" aria-live="assertive">
        <h2 className="bjt-title">🏆 {winnerName} wins the duel!</h2>
        <div className="bjt-duel-arena">
          <div className={`bjt-duelist ${bt.duelWinnerId === duel.controllerId ? 'bjt-duelist--winner' : 'bjt-duelist--loser'}`}>
            <img
              src={avatarForId(duel.controllerId)}
              alt={getName(duel.controllerId)}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.controllerId); }}
            />
            <div className="bjt-duelist-name">{getName(duel.controllerId)}</div>
            {renderCards(duel.controllerCards, duel.controllerBust, duel.controllerStood)}
            {bt.duelWinnerId === duel.controllerId && <span className="bjt-winner-badge">✓ Wins</span>}
          </div>

          <div className="bjt-vs" aria-hidden="true">VS</div>

          <div className={`bjt-duelist ${bt.duelWinnerId === duel.opponentId ? 'bjt-duelist--winner' : 'bjt-duelist--loser'}`}>
            <img
              src={avatarForId(duel.opponentId)}
              alt={getName(duel.opponentId)}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.opponentId); }}
            />
            <div className="bjt-duelist-name">{getName(duel.opponentId)}</div>
            {renderCards(duel.opponentCards, duel.opponentBust, duel.opponentStood)}
            {bt.duelWinnerId === duel.opponentId && <span className="bjt-winner-badge">✓ Wins</span>}
          </div>
        </div>

        <p className="bjt-eliminated-msg">
          💀 {loserName} has been eliminated!
        </p>
        <p className="bjt-remaining-msg">
          {bt.remainingPlayerIds.filter((id) => id !== bt.duelLoserId).length} players remain
        </p>
      </div>
    );
  }

  // ── Complete phase ────────────────────────────────────────────────────────
  if (phase === 'complete') {
    const winnerName = bt.winnerId ? getName(bt.winnerId) : 'Unknown';
    const prizeLabel = bt.competitionType === 'HOH' ? 'Head of Household' : 'Power of Veto';

    return (
      <div className="bjt-container bjt-complete" role="status" aria-live="assertive">
        <div className="bjt-crown" aria-hidden="true">👑</div>
        <h2 className="bjt-title bjt-title--winner">
          {winnerName} wins!
        </h2>
        {bt.winnerId && (
          <img
            src={avatarForId(bt.winnerId)}
            alt={winnerName}
            className="bjt-avatar bjt-avatar--xl"
            onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(bt.winnerId!); }}
          />
        )}
        <p className="bjt-prize-label">{prizeLabel}</p>
        <p className="bjt-elim-order">
          Elimination order:{' '}
          {bt.eliminatedPlayerIds.map(getName).join(' → ')}
        </p>
      </div>
    );
  }

  // ── Fallback / idle ───────────────────────────────────────────────────────
  return (
    <div className="bjt-container" role="status">
      <p className="bjt-loading">Loading Blackjack Tournament…</p>
    </div>
  );
}
