/**
 * BlackjackTournamentComp — "Blackjack Tournament" last-player-standing competition.
 *
 * Tournament flow:
 *   spin          — Wheel animation selects the current controller.
 *   select_pair   — Controller (human or AI) selects two fighters for the duel.
 *   duel          — Both players take turns hitting or standing.
 *   duel_result   — Short result beat showing winner/eliminated player; waits for Continue.
 *   complete      — Final winner announced; parent onComplete fires when host presses Continue.
 *
 * Human flow:
 *   - Spin phase: watch the spinner reveal the current controller.
 *   - Pair selection: if a human is in control, tap two eligible avatars to send to the table.
 *   - Duel phase: if human is in the duel, use Hit / Stand buttons.
 *   - Between rounds: tap Continue to advance from duel_result/complete to the next state.
 *   - If eliminated: spectator mode with mostly auto-advance, still gated by Continue where shown.
 *
 * AI flow:
 *   - Fighter pair selection: when controller is AI, pair is auto-selected via aiPickFighters after a delay.
 *   - Duel actions: auto-decided using aiShouldHit + aiDecisionRng.
 *   - All AI timers are cleaned up on unmount / phase change.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  initBlackjackTournament,
  resolveSpinner,
  selectPair,
  hitCurrentPlayer,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  resetBlackjackTournament,
  computeTotal,
  computeSpinnerWinnerIndex,
  cardRank,
  cardSuit,
  aiPickFighters,
  aiShouldHit,
  aiDecisionRng,
} from '../../features/blackjackTournament/blackjackTournamentSlice';
import type { BlackjackTournamentCompetitionType } from '../../features/blackjackTournament/blackjackTournamentSlice';
import { resolveBlackjackTournamentOutcome } from '../../features/blackjackTournament/thunks';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
import HOUSEGUESTS from '../../data/houseguests';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import './BlackjackTournamentComp.css';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Base timer for slow pacing: duel result hold, etc. (ms). */
const TIMER_SLOW_MS = 2_200;
/** Base timer for normal pacing: AI pick delay, AI action delay, etc. (ms). */
const TIMER_NORMAL_MS = 1_400;
/** Base timer for fast AI actions (ms). */
const TIMER_AI_ACTION_MS = 1_000;
/** Duration of the spinner animation (ms). */
const SPIN_DURATION_MS = 2_800;
/** Fraction of SPIN_DURATION_MS at which the spinner slows down visually. */
const SPIN_SLOW_AT_FRACTION = 0.6;
/** Fast-forward speed multiplier applied to all timers for one round. */
const FAST_FORWARD_MULT = 2.5;
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
function renderCards(
  cards: number[],
  bust: boolean,
  stood: boolean,
  highlightIdx: number | null,
): React.ReactNode {
  return (
    <div className="bjt-cards" aria-label={`Cards totalling ${computeTotal(cards)}${bust ? ', busted' : ''}`}>
      {cards.map((c, i) => (
        <span
          key={i}
          className={`bjt-card ${isRedCard(c, i) ? 'bjt-card--red' : ''} ${i === highlightIdx ? 'bjt-card--new' : ''}`}
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

interface RosterBarProps {
  allIds: string[];
  eliminatedIds: string[];
  controllingId: string | null;
  humanId: string | null;
  getName: (id: string) => string;
}

// ─── RosterBar ────────────────────────────────────────────────────────────────

function RosterBar({ allIds, eliminatedIds, controllingId, humanId, getName }: RosterBarProps) {
  return (
    <div className="bjt-roster-wrap" aria-label="Remaining players">
      <div className="bjt-roster">
        {allIds.map((id) => {
          const isElim = eliminatedIds.includes(id);
          const isController = id === controllingId;
          const isYou = id === humanId;
          const classes = [
            'bjt-roster-item',
            isElim ? 'bjt-roster-item--eliminated' : '',
            isController ? 'bjt-roster-item--controller' : '',
            isYou ? 'bjt-roster-item--you' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div key={id} className={classes}>
              <img
                src={avatarForId(id)}
                alt={getName(id)}
                className="bjt-roster-avatar"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getDicebear(id);
                }}
              />
              <span className="bjt-roster-name">{getName(id)}</span>
              {isController && !isElim && (
                <span className="bjt-roster-ctrl" aria-label="In control">⭐</span>
              )}
              {isElim && <span className="bjt-roster-x" aria-hidden="true">✕</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
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

  // Pre-computed card lengths used as stable dep-array values (avoid optional-chain in deps).
  const fighterACardCount = bt.currentDuel?.fighterACards.length ?? 0;
  const fighterBCardCount = bt.currentDuel?.fighterBCards.length ?? 0;

  // Stable refs for timer cleanup.
  const spinTimerRef = useRef<number | null>(null);
  const aiPickTimerRef = useRef<number | null>(null);
  const aiActionTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const spectatorTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const highlightFighterATimerRef = useRef<number | null>(null);
  const highlightFighterBTimerRef = useRef<number | null>(null);

  // Spinner display state (locally animated).
  const [spinnerIdx, setSpinnerIdx] = useState(0);
  const spinnerIntervalRef = useRef<number | null>(null);
  /** Pre-computed winner index (from same seed as reducer) so animation lands on the correct slot. */
  const spinnerWinnerIdxRef = useRef<number>(0);

  // Spin phase: fast-spin vs slow-down phase.
  const [spinFast, setSpinFast] = useState(true);
  // Whether spin reveal animation is showing (brief pause before dispatch).
  const [spinRevealed, setSpinRevealed] = useState(false);

  // Card animation: track last count to detect new cards.
  const prevFighterACountRef = useRef(0);
  const prevFighterBCountRef = useRef(0);
  const [highlightFighterACard, setHighlightFighterACard] = useState<number | null>(null);
  const [highlightFighterBCard, setHighlightFighterBCard] = useState<number | null>(null);

  // Fast-forward: multiplier applied to all timers for the current duel round.
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

  // Human pair selection state (local — not yet committed to Redux).
  const [localFighterAId, setLocalFighterAId] = useState<string | null>(null);
  const [localFighterBId, setLocalFighterBId] = useState<string | null>(null);

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
    clearTimer(spectatorTimerRef);
    clearTimer(revealTimerRef);
    clearTimer(highlightFighterATimerRef);
    clearTimer(highlightFighterBTimerRef);
    if (spinnerIntervalRef.current !== null) {
      window.clearInterval(spinnerIntervalRef.current);
      spinnerIntervalRef.current = null;
    }
  }

  /** Apply the speed multiplier to a base delay (returns shorter delay when faster). */
  const applySpeed = useCallback((baseMs: number): number => {
    return Math.round(baseMs / speedMultiplier);
  }, [speedMultiplier]);

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

  // ── 2. Spin phase: run spinner animation then resolve ─────────────────────
  useEffect(() => {
    if (bt.phase !== 'spin') return;
    const len = bt.remainingPlayerIds.length;
    if (len === 0) return;

    setSpinFast(true);
    setSpinRevealed(false);

    // Pre-compute the winner index using the same formula as the reducer, so
    // the spinner animation always stops on the player Redux will choose.
    spinnerWinnerIdxRef.current = computeSpinnerWinnerIndex(bt.seed, len);

    // Animate spinner by cycling through player indices.
    spinnerIntervalRef.current = window.setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % len);
    }, 180);

    // After SPIN_SLOW_AT_FRACTION of spin duration, slow down visually.
    const slowAt = Math.round(SPIN_DURATION_MS * SPIN_SLOW_AT_FRACTION);
    const slowTimer = window.setTimeout(() => {
      setSpinFast(false);
    }, slowAt);

    spinTimerRef.current = window.setTimeout(() => {
      if (spinnerIntervalRef.current !== null) {
        window.clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }
      // Snap to the correct (pre-computed) winner slot so the highlighted
      // player always matches what Redux will store as controllingPlayerId.
      setSpinnerIdx(spinnerWinnerIdxRef.current);
      setSpinRevealed(true);
      revealTimerRef.current = window.setTimeout(() => {
        setSpinRevealed(false);
        dispatch(resolveSpinner());
      }, 900);
    }, SPIN_DURATION_MS);

    return () => {
      window.clearTimeout(slowTimer);
      if (spinnerIntervalRef.current !== null) {
        window.clearInterval(spinnerIntervalRef.current);
        spinnerIntervalRef.current = null;
      }
      clearTimer(spinTimerRef);
      clearTimer(revealTimerRef);
    };
  }, [bt.phase, bt.remainingPlayerIds.length, bt.seed, dispatch]);

  // ── 3. Pick-opponent phase ────────────────────────────────────────────────
  useEffect(() => {
    if (bt.phase !== 'pick_opponent') return;
    if (!bt.controllingPlayerId) return;

    // Both fighters auto-selected (only 2 players remain): fast-path into duel.
    if (bt.fighterAId !== null && bt.fighterBId !== null) {
      aiPickTimerRef.current = window.setTimeout(() => {
        dispatch(selectPair({ fighterAId: bt.fighterAId!, fighterBId: bt.fighterBId! }));
      }, applySpeed(600));
      return () => { clearTimer(aiPickTimerRef); };
    }

    // AI controller: auto-pick fighters after delay.
    if (!isHuman(bt.controllingPlayerId)) {
      aiPickTimerRef.current = window.setTimeout(() => {
        const fighters = aiPickFighters(
          bt.seed,
          bt.duelIndex,
          bt.controllingPlayerId!,
          bt.remainingPlayerIds,
        );
        if (fighters) dispatch(selectPair(fighters));
      }, applySpeed(TIMER_NORMAL_MS));
      return () => { clearTimer(aiPickTimerRef); };
    }

    // Human controller: reset local selection state for this pick phase.
    setLocalFighterAId(null);
    setLocalFighterBId(null);
  }, [
    bt.phase,
    bt.controllingPlayerId,
    bt.fighterAId,
    bt.fighterBId,
    bt.duelIndex,
    bt.remainingPlayerIds,
    bt.seed,
    dispatch,
    isHuman,
    applySpeed,
  ]);

  // ── 4. Duel phase: AI auto-act and duel resolution ────────────────────────
  useEffect(() => {
    if (bt.phase !== 'duel' || !bt.currentDuel) return;
    const duel = bt.currentDuel;

    if (duel.duelTurn === 'finished') {
      // Both fighters done; resolve the duel.
      aiActionTimerRef.current = window.setTimeout(() => {
        dispatch(resolveDuel());
      }, applySpeed(300));
      return () => { clearTimer(aiActionTimerRef); };
    }

    const activeId = duel.duelTurn === 'fighterA' ? duel.fighterAId : duel.fighterBId;
    const activeCards = duel.duelTurn === 'fighterA' ? duel.fighterACards : duel.fighterBCards;
    const decisionIndex = activeCards.length - 2; // 0 for first decision

    // Human active player: wait for button press, no timer needed.
    if (isHuman(activeId)) return;

    // AI active player: auto-decide after a short delay.
    const rngVal = aiDecisionRng(bt.seed, bt.duelIndex, activeId, decisionIndex);
    const shouldHit = aiShouldHit(computeTotal(activeCards), rngVal);

    const delay = bt.isSpectating ? SPECTATOR_ADVANCE_MS : applySpeed(TIMER_AI_ACTION_MS);
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
    applySpeed,
  ]);

  // ── 5. Duel result phase: hold then advance; reset speed multiplier ────────
  useEffect(() => {
    if (bt.phase !== 'duel_result') return;
    const delay = bt.isSpectating ? SPECTATOR_ADVANCE_MS : applySpeed(TIMER_SLOW_MS);
    resultTimerRef.current = window.setTimeout(() => {
      // Reset fast-forward after each duel round completes.
      setSpeedMultiplier(1.0);
      dispatch(advanceFromDuelResult());
    }, delay);
    return () => { clearTimer(resultTimerRef); };
  }, [bt.phase, bt.isSpectating, dispatch, applySpeed]);

  // ── 6. Card highlight: detect new cards in duel ───────────────────────────
  useEffect(() => {
    if (!bt.currentDuel) return;
    const ac = bt.currentDuel.fighterACards.length;
    const bc = bt.currentDuel.fighterBCards.length;
    if (ac > prevFighterACountRef.current) {
      setHighlightFighterACard(ac - 1);
      clearTimer(highlightFighterATimerRef);
      highlightFighterATimerRef.current = window.setTimeout(() => setHighlightFighterACard(null), 400);
    }
    if (bc > prevFighterBCountRef.current) {
      setHighlightFighterBCard(bc - 1);
      clearTimer(highlightFighterBTimerRef);
      highlightFighterBTimerRef.current = window.setTimeout(() => setHighlightFighterBCard(null), 400);
    }
    prevFighterACountRef.current = ac;
    prevFighterBCountRef.current = bc;
  }, [fighterACardCount, fighterBCardCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // ^ deps limited to card lengths: effect only fires when a card is added.

  // Reset card refs when a new duel starts.
  useEffect(() => {
    prevFighterACountRef.current = 0;
    prevFighterBCountRef.current = 0;
  }, [bt.duelIndex, bt.rematchCount]);

  // ─── Derived roster data ──────────────────────────────────────────────────

  // Maintain a stable full-order list of all participant IDs.
  const allParticipantIds = participantIds;

  // ─── Render ──────────────────────────────────────────────────────────────

  const { phase } = bt;

  // ── Spin phase ────────────────────────────────────────────────────────────
  if (phase === 'spin') {
    const len = bt.remainingPlayerIds.length;
    if (len === 0) {
      return (
        <div className="bjt-container" role="status">
          <p className="bjt-loading">Loading Blackjack Tournament…</p>
        </div>
      );
    }

    // 3-slot window: show previous, active, and next item.
    const activeLocalIdx = spinnerIdx % len;
    const slots = [-1, 0, 1].map((offset) => {
      const idx = (activeLocalIdx + offset + len) % len;
      return { id: bt.remainingPlayerIds[idx], offset };
    });

    return (
      <div className="bjt-container bjt-spin" role="status" aria-live="polite">
        <h2 className="bjt-title bjt-spin-title">🎰 Blackjack Tournament</h2>
        <p className="bjt-subtitle">Spinning to pick the first controller…</p>

        <div className="bjt-reel-viewport" aria-label="Spinner">
          <div className="bjt-reel-track">
            {slots.map(({ id, offset }) => {
              const isActive = offset === 0;
              const slotClasses = [
                'bjt-spinner-slot',
                isActive ? 'bjt-spinner-slot--active' : '',
                spinFast && !isActive ? 'bjt-spinner-slot--fast' : '',
                isActive && spinRevealed ? 'bjt-spinner-slot--revealed' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={`${id}-${offset}`} className={slotClasses}>
                  <img
                    src={avatarForId(id)}
                    alt={getName(id)}
                    className="bjt-avatar bjt-avatar--sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getDicebear(id);
                    }}
                  />
                  <span>{getName(id)}</span>
                </div>
              );
            })}
          </div>
          <div className="bjt-reel-edge bjt-reel-edge--top" aria-hidden="true" />
          <div className="bjt-reel-edge bjt-reel-edge--bottom" aria-hidden="true" />
          <div className="bjt-spinner-pointer" aria-hidden="true">▼</div>
        </div>

        <p className="bjt-remaining">
          {bt.remainingPlayerIds.length} players competing
        </p>

        <RosterBar
          allIds={allParticipantIds}
          eliminatedIds={bt.eliminatedPlayerIds}
          controllingId={null}
          humanId={bt.humanPlayerId}
          getName={getName}
        />
      </div>
    );
  }

  // ── Pick-opponent phase ───────────────────────────────────────────────────
  if (phase === 'pick_opponent') {
    const controllerId = bt.controllingPlayerId ?? '';
    const humanIsController = isHuman(controllerId);
    const availablePlayers = bt.remainingPlayerIds;

    // Human controller pair selection handlers.
    function handlePlayerClick(id: string) {
      if (!humanIsController) return;
      if (id === localFighterAId) {
        setLocalFighterAId(null);
        return;
      }
      if (id === localFighterBId) {
        setLocalFighterBId(null);
        return;
      }
      if (localFighterAId === null) {
        setLocalFighterAId(id);
      } else if (localFighterBId === null) {
        setLocalFighterBId(id);
      }
    }

    const canConfirm = humanIsController && localFighterAId !== null && localFighterBId !== null;

    return (
      <div className="bjt-container bjt-pick" role="region" aria-label="Fighter selection">
        <div className="bjt-players-remaining" role="status" aria-live="polite">
          <span className="bjt-badge">{bt.remainingPlayerIds.length} remaining</span>
          {bt.eliminatedPlayerIds.length > 0 && (
            <span className="bjt-eliminated-list">
              Eliminated: {bt.eliminatedPlayerIds.map((id) => getName(id)).join(', ')}
            </span>
          )}
        </div>

        {/* Controller spotlight */}
        <div className="bjt-controller-card">
          <span className="bjt-controller-label">🎮 In Control</span>
          <img
            src={avatarForId(controllerId)}
            alt={getName(controllerId)}
            className="bjt-avatar bjt-avatar--lg"
            onError={(e) => {
              (e.target as HTMLImageElement).src = getDicebear(controllerId);
            }}
          />
          <span className="bjt-duelist-name">
            {getName(controllerId)}
            {humanIsController && <span className="bjt-you-badge"> (you)</span>}
          </span>
        </div>

        <p className="bjt-pick-instruction">
          {humanIsController
            ? '⚔️ Pick the next two players to duel:'
            : '🔍 Choosing two players to duel…'}
        </p>

        {/* Fighter selection slots (shown for human controller) */}
        {humanIsController && (
          <div className="bjt-fighter-slots">
            <div className={`bjt-fighter-slot ${localFighterAId ? 'bjt-fighter-slot--filled' : ''}`}>
              <span className="bjt-slot-label">Fighter A</span>
              {localFighterAId ? (
                <span className="bjt-slot-name">{getName(localFighterAId)}</span>
              ) : (
                <span className="bjt-slot-empty">— pick below —</span>
              )}
            </div>
            <div className="bjt-vs bjt-vs--small" aria-hidden="true">VS</div>
            <div className={`bjt-fighter-slot ${localFighterBId ? 'bjt-fighter-slot--filled' : ''}`}>
              <span className="bjt-slot-label">Fighter B</span>
              {localFighterBId ? (
                <span className="bjt-slot-name">{getName(localFighterBId)}</span>
              ) : (
                <span className="bjt-slot-empty">— pick below —</span>
              )}
            </div>
          </div>
        )}

        <div className="bjt-opponent-grid" role="list">
          {availablePlayers.map((id) => {
            const isA = id === localFighterAId;
            const isB = id === localFighterBId;
            const slotLabel = isA ? ' (A)' : isB ? ' (B)' : '';
            const btnClass = [
              'bjt-opponent-btn',
              !humanIsController ? 'bjt-opponent-btn--disabled' : '',
              isA ? 'bjt-opponent-btn--selected-a' : '',
              isB ? 'bjt-opponent-btn--selected-b' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={id}
                className={btnClass}
                onClick={() => handlePlayerClick(id)}
                disabled={!humanIsController}
                aria-label={`Select ${getName(id)}${slotLabel}`}
                role="listitem"
              >
                <img
                  src={avatarForId(id)}
                  alt={getName(id)}
                  className="bjt-avatar bjt-avatar--lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = getDicebear(id);
                  }}
                />
                <span className="bjt-duelist-name">
                  {getName(id)}{slotLabel}
                </span>
              </button>
            );
          })}
        </div>

        {canConfirm && (
          <button
            className="bjt-btn bjt-btn--confirm"
            onClick={() => {
              dispatch(selectPair({ fighterAId: localFighterAId!, fighterBId: localFighterBId! }));
            }}
            aria-label="Confirm duel pair and start"
          >
            ⚔️ Start Duel
          </button>
        )}

        <RosterBar
          allIds={allParticipantIds}
          eliminatedIds={bt.eliminatedPlayerIds}
          controllingId={controllerId}
          humanId={bt.humanPlayerId}
          getName={getName}
        />
      </div>
    );
  }

  // ── Duel phase ────────────────────────────────────────────────────────────
  if (phase === 'duel' && bt.currentDuel) {
    const duel = bt.currentDuel;
    const aName = getName(duel.fighterAId);
    const bName = getName(duel.fighterBId);
    const humanInDuel = isHuman(duel.fighterAId) || isHuman(duel.fighterBId);
    const humanTurn =
      (duel.duelTurn === 'fighterA' && isHuman(duel.fighterAId)) ||
      (duel.duelTurn === 'fighterB' && isHuman(duel.fighterBId));

    const activeId =
      duel.duelTurn === 'fighterA'
        ? duel.fighterAId
        : duel.duelTurn === 'fighterB'
          ? duel.fighterBId
          : null;
    const activeName = activeId ? getName(activeId) : '';

    return (
      <div className="bjt-container bjt-duel" role="region" aria-label="Blackjack duel">
        <h2 className="bjt-title">⚔️ Duel: {aName} vs {bName}</h2>

        {/* Fast-forward button */}
        <button
          className={`bjt-btn bjt-btn--ff ${speedMultiplier > 1 ? 'bjt-btn--ff-active' : ''}`}
          onClick={() => setSpeedMultiplier(speedMultiplier > 1 ? 1.0 : FAST_FORWARD_MULT)}
          aria-label={speedMultiplier > 1 ? 'Normal speed' : 'Fast-forward this round'}
          title={speedMultiplier > 1 ? 'Normal speed' : 'Fast-forward this round'}
        >
          {speedMultiplier > 1 ? '▶ 1×' : '» FF'}
        </button>

        <div className="bjt-duel-arena" aria-label="Blackjack duel arena">
          {/* Fighter A */}
          <div
            className={[
              'bjt-duelist',
              duel.duelTurn === 'fighterA' && !duel.fighterAStood && !duel.fighterABust
                ? 'bjt-duelist--active'
                : '',
              duel.fighterABust ? 'bjt-duelist--bust' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <img
              src={avatarForId(duel.fighterAId)}
              alt={aName}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = getDicebear(duel.fighterAId);
              }}
            />
            <div className="bjt-duelist-name">
              {aName}
              {isHuman(duel.fighterAId) && <span className="bjt-you-badge"> (you)</span>}
            </div>
            {renderCards(duel.fighterACards, duel.fighterABust, duel.fighterAStood, highlightFighterACard)}
          </div>

          <div className="bjt-vs" aria-hidden="true">VS</div>

          {/* Fighter B */}
          <div
            className={[
              'bjt-duelist',
              duel.duelTurn === 'fighterB' && !duel.fighterBStood && !duel.fighterBBust
                ? 'bjt-duelist--active'
                : '',
              duel.fighterBBust ? 'bjt-duelist--bust' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <img
              src={avatarForId(duel.fighterBId)}
              alt={bName}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = getDicebear(duel.fighterBId);
              }}
            />
            <div className="bjt-duelist-name">
              {bName}
              {isHuman(duel.fighterBId) && <span className="bjt-you-badge"> (you)</span>}
            </div>
            {renderCards(duel.fighterBCards, duel.fighterBBust, duel.fighterBStood, highlightFighterBCard)}
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

        <RosterBar
          allIds={allParticipantIds}
          eliminatedIds={bt.eliminatedPlayerIds}
          controllingId={bt.controllingPlayerId}
          humanId={bt.humanPlayerId}
          getName={getName}
        />
      </div>
    );
  }

  // ── Duel result phase ─────────────────────────────────────────────────────
  if (phase === 'duel_result' && bt.currentDuel) {
    const duel = bt.currentDuel;

    if (bt.isDuelTie) {
      return (
        <div className="bjt-container bjt-result" role="status" aria-live="assertive">
          <h2 className="bjt-title">🤝 Tie — Rematch!</h2>
          <p className="bjt-tie-msg">
            {getName(duel.fighterAId)} and {getName(duel.fighterBId)} tied!
            Rematching…
          </p>
          <div className="bjt-duel-arena">
            <div className="bjt-duelist">
              <img src={avatarForId(duel.fighterAId)} alt={getName(duel.fighterAId)} className="bjt-avatar bjt-avatar--lg"
                onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.fighterAId); }} />
              <div className="bjt-duelist-name">{getName(duel.fighterAId)}</div>
              {renderCards(duel.fighterACards, duel.fighterABust, duel.fighterAStood, null)}
            </div>
            <div className="bjt-vs" aria-hidden="true">VS</div>
            <div className="bjt-duelist">
              <img src={avatarForId(duel.fighterBId)} alt={getName(duel.fighterBId)} className="bjt-avatar bjt-avatar--lg"
                onError={(e) => { (e.target as HTMLImageElement).src = getDicebear(duel.fighterBId); }} />
              <div className="bjt-duelist-name">{getName(duel.fighterBId)}</div>
              {renderCards(duel.fighterBCards, duel.fighterBBust, duel.fighterBStood, null)}
            </div>
          </div>
          <RosterBar
            allIds={allParticipantIds}
            eliminatedIds={bt.eliminatedPlayerIds}
            controllingId={bt.controllingPlayerId}
            humanId={bt.humanPlayerId}
            getName={getName}
          />
        </div>
      );
    }

    const winnerName = bt.duelWinnerId ? getName(bt.duelWinnerId) : '';
    const loserName = bt.duelLoserId ? getName(bt.duelLoserId) : '';

    return (
      <div className="bjt-container bjt-result" role="status" aria-live="assertive">
        <div className="bjt-result-confetti" aria-hidden="true" />
        <h2 className="bjt-title">🏆 {winnerName} wins the duel!</h2>
        <div className="bjt-duel-arena">
          <div
            className={`bjt-duelist ${bt.duelWinnerId === duel.fighterAId ? 'bjt-duelist--winner' : 'bjt-duelist--loser'}`}
          >
            <img
              src={avatarForId(duel.fighterAId)}
              alt={getName(duel.fighterAId)}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = getDicebear(duel.fighterAId);
              }}
            />
            <div className="bjt-duelist-name">{getName(duel.fighterAId)}</div>
            {renderCards(duel.fighterACards, duel.fighterABust, duel.fighterAStood, null)}
            {bt.duelWinnerId === duel.fighterAId && (
              <span className="bjt-winner-badge">✓ Wins</span>
            )}
          </div>

          <div className="bjt-vs" aria-hidden="true">VS</div>

          <div
            className={`bjt-duelist ${bt.duelWinnerId === duel.fighterBId ? 'bjt-duelist--winner' : 'bjt-duelist--loser'}`}
          >
            <img
              src={avatarForId(duel.fighterBId)}
              alt={getName(duel.fighterBId)}
              className="bjt-avatar bjt-avatar--lg"
              onError={(e) => {
                (e.target as HTMLImageElement).src = getDicebear(duel.fighterBId);
              }}
            />
            <div className="bjt-duelist-name">{getName(duel.fighterBId)}</div>
            {renderCards(duel.fighterBCards, duel.fighterBBust, duel.fighterBStood, null)}
            {bt.duelWinnerId === duel.fighterBId && (
              <span className="bjt-winner-badge">✓ Wins</span>
            )}
          </div>
        </div>

        <p className="bjt-eliminated-msg">
          💀 {loserName} has been eliminated!
        </p>
        <p className="bjt-remaining-msg">
          {bt.remainingPlayerIds.filter((id) => id !== bt.duelLoserId).length} players remain
        </p>

        <RosterBar
          allIds={allParticipantIds}
          eliminatedIds={[...bt.eliminatedPlayerIds, ...(bt.duelLoserId ? [bt.duelLoserId] : [])]}
          controllingId={null}
          humanId={bt.humanPlayerId}
          getName={getName}
        />
      </div>
    );
  }

  // ── Complete phase ────────────────────────────────────────────────────────
  if (phase === 'complete') {
    const winnerName = bt.winnerId ? getName(bt.winnerId) : 'Unknown';
    const prizeLabel = bt.competitionType === 'HOH' ? 'Head of Household' : 'Power of Veto';

    return (
      <div className="bjt-container bjt-complete" role="status" aria-live="assertive">
        <div className="bjt-confetti" aria-hidden="true" />
        <div className="bjt-confetti--reverse" aria-hidden="true" />
        <MinigameCompleteWrapper
          onContinue={() => {
            if (!bt.outcomeResolved) {
              dispatch(resolveBlackjackTournamentOutcome());
            }
            onComplete?.();
          }}
          continueLabel="Continue →"
          continueButtonClassName="bjt-btn bjt-btn--continue"
          placementsNode={bt.eliminatedPlayerIds.length > 0 ? (
            <>
              <p className="bjt-elim-order">
                Elimination order:{' '}
                {bt.eliminatedPlayerIds.map(getName).join(' → ')}
              </p>
              <RosterBar
                allIds={allParticipantIds}
                eliminatedIds={bt.eliminatedPlayerIds}
                controllingId={bt.winnerId ?? null}
                humanId={bt.humanPlayerId}
                getName={getName}
              />
            </>
          ) : undefined}
        >
          <div className="bjt-crown" aria-hidden="true">👑</div>
          <h2 className="bjt-title bjt-title--winner">
            {winnerName} wins!
          </h2>

          {bt.winnerId && (
            <div className="bjt-winner-avatar-wrap">
              <img
                src={avatarForId(bt.winnerId)}
                alt={winnerName}
                className="bjt-avatar bjt-avatar--xxl"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getDicebear(bt.winnerId!);
                }}
              />
            </div>
          )}

          <p className="bjt-prize-label">{prizeLabel}</p>
        </MinigameCompleteWrapper>
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
