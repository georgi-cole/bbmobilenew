/**
 * HouseOfCardsComp — "House of Cards" memory-match competition screen.
 *
 * Hybrid gameplay:
 *   - Memory-card matching race (core gameplay)
 *   - Compact event ticker showing AI progress (spectator-friendly)
 *   - Streak-triggered Peek effect (once per game, auto at 2-pair streak)
 *
 * Phases: active → complete
 *
 * The component:
 *   1. Dispatches startHouseOfCards on mount.
 *   2. Runs the human's card-flip game loop locally via useState.
 *   3. On game over (all pairs found OR time runs out), dispatches finaliseOutcome.
 *   4. Dispatches resolveHouseOfCardsOutcome to apply winner/last-place.
 *   5. Shows a rich results screen from canonical standings.
 *   6. Fires onComplete() to hand control back to MinigameHost.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import type { RootState } from '../../store/store';
import {
  startHouseOfCards,
  finaliseOutcome,
  resetHouseOfCards,
  TOTAL_PAIRS,
  GAME_TIME_LIMIT_MS,
} from '../../features/houseOfCards/houseOfCardsSlice';
import type {
  HouseOfCardsState,
  HouseOfCardsPrizeType,
  PlayerOutcome,
} from '../../features/houseOfCards/houseOfCardsSlice';
import { resolveHouseOfCardsOutcome } from '../../features/houseOfCards/thunks';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import {
  buildHouseOfCardsBoard,
  PEEK_DURATION_MS,
  PEEK_STREAK_TRIGGER,
  type HouseOfCardsBoardCard,
} from './houseOfCardsUtils';
import { useHouseOfCardsAudio } from '../../hooks/useHouseOfCardsAudio';
import './HouseOfCardsComp.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParticipantProp {
  id: string;
  name: string;
  isHuman: boolean;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantProp[];
  prizeType: HouseOfCardsPrizeType;
  seed: number;
  onComplete?: (completion?: ReactMinigameCompletion) => void;
}

interface TickerEvent {
  id: string;
  text: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

function getMissesLabel(mistakes: number): string {
  return `${mistakes} ${mistakes === 1 ? 'miss' : 'misses'}`;
}

const MISMATCH_HIDE_MS = 900;

// ─── Component ────────────────────────────────────────────────────────────────

export default function HouseOfCardsComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();

  // Resolve the human player id.
  const humanId = useMemo(
    () =>
      participants?.find((p) => p.isHuman)?.id ??
      participantIds.find((id) => {
        const p = participants?.find((x) => x.id === id);
        return p ? p.isHuman : false;
      }) ??
      participantIds[0] ??
      null,
    [participants, participantIds],
  );

  // Resolve display name for each player.
  const nameFor = useCallback(
    (id: string): string => participants?.find((p) => p.id === id)?.name ?? id,
    [participants],
  );

  // ── Redux state ─────────────────────────────────────────────────────────
  const hoc = useAppSelector(
    (s: RootState) => (s as RootState & { houseOfCards?: HouseOfCardsState }).houseOfCards,
  );

  // ── Local game state ─────────────────────────────────────────────────────
  const [board, setBoard] = useState<HouseOfCardsBoardCard[]>([]);
  const [locked, setLocked] = useState(false);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME_LIMIT_MS / 1000);
  const [gameOver, setGameOver] = useState(false);
  const [peekActive, setPeekActive] = useState(false);
  /** Whether the one-time streak-triggered peek has already been used. */
  const [peekUsed, setPeekUsed] = useState(false);
  const [burstText, setBurstText] = useState<string | null>(null);
  /** Event ticker: latest events shown at the bottom of the screen. */
  const [tickerEvents, setTickerEvents] = useState<TickerEvent[]>([]);

  const startTimeRef = useRef<number>(Date.now());
  const gameOverRef = useRef(false);
  const matchedPairsRef = useRef(0);
  const mistakesRef = useRef(0);
  const turnsTakenRef = useRef(0);
  const streakBestRef = useRef(0);
  const finalisedRef = useRef(false);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionSoundPlayedRef = useRef(false);
  const { playFlip, playMatch, playMismatch, playPeek, playComplete } = useHouseOfCardsAudio(
    hoc?.status === 'active' && !gameOver,
  );

  // ── Initialise competition ───────────────────────────────────────────────
  useEffect(() => {
    dispatch(
      startHouseOfCards({
        participantIds,
        humanId,
        prizeType,
        seed,
      }),
    );
    setBoard(buildHouseOfCardsBoard(seed));
    startTimeRef.current = Date.now();
    gameOverRef.current = false;
    finalisedRef.current = false;
    return () => {
      if (peekTimeoutRef.current) {
        clearTimeout(peekTimeoutRef.current);
        peekTimeoutRef.current = null;
      }
      dispatch(resetHouseOfCards());
    };
  // Intentionally run only on mount: participants/seed/prizeType define the competition
  // session and must not change mid-game (restart would require a remount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Schedule AI ticker events from pre-computed outcomes ─────────────────
  // Events fire at the AI's deterministic completion time so the ticker
  // shows "X finished!" realistically spread over the game clock.
  useEffect(() => {
    if (!hoc || hoc.status !== 'active') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const entries = Object.entries(hoc.aiOutcomes);

    // Intermediate "found a match" events: fired at ~halfway through their run
    entries.forEach(([id, outcome]) => {
      const halfTime = outcome.didFinish && outcome.completionTimeMs !== null
        ? outcome.completionTimeMs / 2
        : 20_000;
      const t1 = setTimeout(() => {
        setTickerEvents((prev) => [
          { id: `${id}-mid`, text: `${nameFor(id).split(' ')[0]} matched a pair` },
          ...prev,
        ].slice(0, 5));
      }, halfTime);
      timers.push(t1);

      // "Finished" event
      if (outcome.didFinish && outcome.completionTimeMs !== null) {
        const t2 = setTimeout(() => {
          setTickerEvents((prev) => [
            { id: `${id}-done`, text: `${nameFor(id).split(' ')[0]} finished! 🏁` },
            ...prev,
          ].slice(0, 5));
        }, outcome.completionTimeMs);
        timers.push(t2);
      }
    });

    return () => timers.forEach(clearTimeout);
  // Re-run when the game starts (hoc.status flips to active) or when
  // nameFor changes (participants updated). The effect captures nameFor
  // at scheduling time so it must be in deps to avoid stale name lookups.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoc?.status, nameFor]);

  // ── Countdown timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gameOver) return;
    if (timeLeft <= 0) {
      setGameOver(true);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, gameOver]);

  // ── Finalise outcome once game is over ──────────────────────────────────
  useEffect(() => {
    if (!gameOver || finalisedRef.current) return;
    if (!hoc || hoc.status === 'complete') return; // already done

    finalisedRef.current = true;
    const elapsed = Date.now() - startTimeRef.current;
    const didFinish = matchedPairsRef.current >= TOTAL_PAIRS;

    dispatch(
      finaliseOutcome({
        matchedPairs: matchedPairsRef.current,
        mistakes: mistakesRef.current,
        turnsTaken: turnsTakenRef.current,
        completionTimeMs: didFinish ? elapsed : null,
        streakBest: streakBestRef.current,
        humanId: humanId ?? participantIds[0] ?? '',
      }),
    );
  }, [gameOver, dispatch, humanId, participantIds, hoc]);

  // ── When slice reaches complete, dispatch outcome thunk ──────────────────
  useEffect(() => {
    if (!hoc || hoc.status !== 'complete') return;
    dispatch(resolveHouseOfCardsOutcome());
  }, [hoc, dispatch]);

  useEffect(() => {
    if (hoc?.status === 'complete' && !completionSoundPlayedRef.current) {
      completionSoundPlayedRef.current = true;
      playComplete();
      return;
    }

    if (hoc?.status !== 'complete') {
      completionSoundPlayedRef.current = false;
    }
  }, [hoc?.status, playComplete]);

  // ── Card flip handler ────────────────────────────────────────────────────
  const handleCardClick = useCallback(
    (cardIndex: number) => {
      if (locked || gameOver) return;
      const card = board[cardIndex];
      if (!card || card.isMatched || card.isFlipped) return;
      playFlip();

      const newBoard = board.map((c, i) =>
        i === cardIndex ? { ...c, isFlipped: true } : c,
      );
      const newFlipped = [...flippedIndices, cardIndex];

      if (newFlipped.length === 2) {
        const [a, b] = newFlipped;
        const cardA = newBoard[a];
        const cardB = newBoard[b];
        setLocked(true);
        turnsTakenRef.current += 1;

        if (cardA.symbol === cardB.symbol) {
          // Match!
          playMatch();
          const newMatched = matchedPairsRef.current + 1;
          matchedPairsRef.current = newMatched;
          const newStreak = streak + 1;
          const newStreakBest = Math.max(newStreak, streakBestRef.current);
          streakBestRef.current = newStreakBest;

          newBoard[a] = { ...newBoard[a], isMatched: true, isFlipped: true };
          newBoard[b] = { ...newBoard[b], isMatched: true, isFlipped: true };

          const burstMsg = newStreak >= 3 ? `🔥 ${newStreak}× STREAK!` : '✓ MATCH!';
          setBurstText(burstMsg);
          setTimeout(() => setBurstText(null), 600);

          setBoard(newBoard);
          setMatchedPairs(newMatched);
          setStreak(newStreak);
          setFlippedIndices([]);
          setLocked(false);

          // ── Streak-triggered Peek (once per game) ────────────────────
          // Triggers the first time the player completes a streak of
          // PEEK_STREAK_TRIGGER consecutive correct pairs.
          if (newStreak >= PEEK_STREAK_TRIGGER && !peekUsed) {
            setPeekUsed(true);
            setPeekActive(true);
            playPeek();
            // Reveal all currently-unmatched cards for PEEK_DURATION_MS.
            setBoard((prev) =>
              prev.map((c) => (!c.isMatched ? { ...c, isFlipped: true } : c)),
            );
            // Capture indices that are currently flipped (not yet matched) so
            // we only hide cards that the peek itself revealed.
            const alreadyRevealedIndices = new Set(newBoard.filter((c) => c.isFlipped && !c.isMatched).map((c) => c.index));
            peekTimeoutRef.current = setTimeout(() => {
              setBoard((prev) =>
                prev.map((c) =>
                  !c.isMatched && !alreadyRevealedIndices.has(c.index) ? { ...c, isFlipped: false } : c,
                ),
              );
              setPeekActive(false);
              peekTimeoutRef.current = null;
            }, PEEK_DURATION_MS);
          }

          if (newMatched >= TOTAL_PAIRS) {
            setGameOver(true);
          }
        } else {
          // Mismatch
          playMismatch();
          mistakesRef.current += 1;
          setMistakes((m) => m + 1);
          newBoard[a] = { ...newBoard[a], isMismatch: true };
          newBoard[b] = { ...newBoard[b], isMismatch: true };
          setBoard(newBoard);
          setStreak(0);
          setFlippedIndices([]);
          setTimeout(() => {
            setBoard((prev) =>
              prev.map((c, i) =>
                i === a || i === b
                  ? { ...c, isFlipped: false, isMismatch: false }
                  : c,
              ),
            );
            setLocked(false);
          }, MISMATCH_HIDE_MS);
        }
        return;
      }

      setBoard(newBoard);
      setFlippedIndices(newFlipped);
    },
    [board, locked, gameOver, flippedIndices, streak, peekUsed, playFlip, playMatch, playPeek, playMismatch],
  );

  // ── Results screen ──────────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  if (hoc?.status === 'complete' && hoc.standings.length > 0) {
    const winner = hoc.standings[0];
    const lastPlace = hoc.standings[hoc.standings.length - 1];
    const winnerName = nameFor(winner.playerId);
    const isHumanWinner = winner.playerId === humanId;

    return (
      <MinigameCompleteWrapper
        className="hoc-complete"
        onContinue={handleContinue}
        continueLabel="Continue ▶"
        continueButtonClassName="hoc-complete-continue"
        placementsNode={
          <div className="hoc-standings">
            <div className="hoc-standings-label">Final Standings</div>
            <ol className="hoc-standings-list" role="list" aria-label="Final standings">
              {hoc.standings.map((outcome: PlayerOutcome) => {
                const isHuman = outcome.playerId === humanId;
                const isLast = outcome.playerId === lastPlace.playerId;
                const isWinner = outcome.playerId === winner.playerId;
                const rowClass = [
                  'hoc-standing-row',
                  isWinner ? 'hoc-standing--winner' : '',
                  isLast && !isWinner ? 'hoc-standing--last' : '',
                  isHuman ? 'hoc-standing--human' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <li key={outcome.playerId} className={rowClass}>
                    <span
                      className={[
                        'hoc-standing-rank',
                        outcome.finalRank <= 3 ? `hoc-standing-rank--top-${outcome.finalRank}` : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`Rank ${outcome.finalRank}`}
                    >
                      {outcome.finalRank}
                    </span>
                    <div className="hoc-standing-summary">
                      <span
                        className={`hoc-standing-name${isHuman ? ' hoc-standing-name--human' : ''}`}
                      >
                        {nameFor(outcome.playerId)}
                      </span>
                      <span className="hoc-standing-meta">
                        {outcome.matchedPairs}/{TOTAL_PAIRS} pairs ·{' '}
                        {getMissesLabel(outcome.mistakes)}
                      </span>
                    </div>
                    <div className="hoc-standing-details">
                      <span className="hoc-standing-score">{outcome.clashScore} pts</span>
                      <div className="hoc-standing-badges">
                        {isHuman && !isLast && (
                          <span className="hoc-standing-badge hoc-badge--you">You</span>
                        )}
                        {isLast && !isWinner && (
                          <span className="hoc-standing-badge hoc-badge--last">Last</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        }
      >
        <div className="hoc-complete-title">
          <span className="hoc-complete-title-icon" aria-hidden="true" />
          <span>House of Cards</span>
        </div>
        <div className="hoc-complete-winner">
          <div className="hoc-complete-winner-rank" aria-hidden="true">
            1
          </div>
          <div className="hoc-complete-winner-badge">{isHumanWinner ? 'You Win!' : 'Winner'}</div>
          <div className="hoc-complete-winner-name">{winnerName}</div>
          <div className="hoc-complete-winner-score">{winner.clashScore} clash points</div>
          <div className="hoc-complete-winner-meta">
            {winner.matchedPairs}/{TOTAL_PAIRS} pairs · {getMissesLabel(winner.mistakes)}
          </div>
        </div>
      </MinigameCompleteWrapper>
    );
  }

  // Timer formatting
  const timerClass =
    timeLeft <= 5
      ? 'hoc-timer hoc-timer--danger'
      : timeLeft <= 15
      ? 'hoc-timer hoc-timer--warning'
      : 'hoc-timer';

  return (
    <div className="hoc-root">
      {/* HUD — compact stat bar */}
      <div className="hoc-hud" role="status" aria-label="Game stats">
        <div className="hoc-hud-stat">
          <strong className={timerClass}>{timeLeft}s</strong>
          <span>Time</span>
        </div>
        <div className="hoc-hud-stat">
          <strong>
            {matchedPairs}/{TOTAL_PAIRS}
          </strong>
          <span>Pairs</span>
        </div>
        <div className="hoc-hud-stat">
          <strong>{mistakes}</strong>
          <span>Misses</span>
        </div>
        <div className={`hoc-streak${streak >= 2 ? ' hoc-streak--active' : ''}`}>
          🔥 {streak}×
        </div>
        {!peekUsed && (
          <div className="hoc-peek-hint" title="Match 2 pairs in a row to unlock Peek">
            👁 ×1
          </div>
        )}
      </div>

      {/* Card board — primary interaction area, scrolls if needed */}
      <div className="hoc-board-wrap">
        <div className="hoc-board" role="grid" aria-label="Card grid">
          {board.map((card, i) => (
            <div
              key={i}
              className="hoc-card"
              data-flipped={card.isFlipped ? 'true' : 'false'}
              data-matched={card.isMatched ? 'true' : 'false'}
              data-mismatch={card.isMismatch ? 'true' : 'false'}
              data-locked={locked || card.isMatched ? 'true' : 'false'}
              role="gridcell"
              aria-label={card.isFlipped || card.isMatched ? card.symbol : 'Hidden card'}
              onClick={() => handleCardClick(i)}
              tabIndex={card.isMatched ? -1 : 0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCardClick(i);
              }}
            >
              <div className="hoc-card-inner">
                <div className="hoc-card-face hoc-card-back">
                  <div className="hoc-card-back-pattern" />
                  {/* Subtle SVG eye mark — thematic, low-contrast */}
                  <svg
                    className="hoc-card-eye"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <ellipse cx="12" cy="12" rx="10" ry="6" />
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="12" r="1.2" className="hoc-card-eye-pupil" />
                  </svg>
                </div>
                <div className="hoc-card-face hoc-card-front" aria-hidden="true">
                  {card.symbol}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compact event ticker — bottom, replaces bulky progress rail */}
      {tickerEvents.length > 0 && (
        <div className="hoc-ticker" aria-label="Competition updates" aria-live="polite">
          {tickerEvents.slice(0, 3).map((ev) => (
            <div key={ev.id} className="hoc-ticker-item">{ev.text}</div>
          ))}
        </div>
      )}

      {/* Burst animation */}
      {burstText && (
        <div className="hoc-match-burst" aria-hidden="true">
          <div
            className={`hoc-match-burst-text${
              burstText.includes('STREAK') ? ' hoc-burst--streak' : ' hoc-burst--match'
            }`}
          >
            {burstText}
          </div>
        </div>
      )}

      {/* Peek overlay */}
      {peekActive && (
        <div className="hoc-peek-overlay" aria-live="polite">
          <div className="hoc-peek-banner">👁 PEEK!</div>
        </div>
      )}

      {/* Time up overlay */}
      {gameOver && matchedPairs < TOTAL_PAIRS && (
        <div className="hoc-timeout-overlay" role="alert">
          <div className="hoc-timeout-card">
            <h3>⏰ Time&rsquo;s Up!</h3>
            <p>
              You matched {matchedPairs} of {TOTAL_PAIRS} pairs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
