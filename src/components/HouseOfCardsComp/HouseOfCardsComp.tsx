/**
 * HouseOfCardsComp — "House of Cards" memory-match competition screen.
 *
 * Hybrid gameplay:
 *   - Memory-card matching race (core gameplay)
 *   - Lane-race progress rail (spectator-friendly HUD)
 *   - Light power moments: Peek (brief reveal) and Combo Boost
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
import { mulberry32 } from '../../store/rng';
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
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

interface CardState {
  index: number;
  symbol: string;
  /** Whether a power tile is hidden under this card */
  power: 'peek' | 'boost' | null;
  isFlipped: boolean;
  isMatched: boolean;
  isMismatch: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_SYMBOLS = ['🌙', '⚡', '🎭', '🔮', '🃏', '♠️', '♥️', '♦️'];

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_ICONS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

const MISMATCH_HIDE_MS = 900;
const PEEK_DURATION_MS = 1800;

// ─── Board builder ────────────────────────────────────────────────────────────

/**
 * Build a seeded shuffled board of TOTAL_PAIRS × 2 cards.
 * Two random cards are assigned power tiles (peek / boost).
 */
function buildBoard(seed: number): CardState[] {
  const rng = mulberry32(seed ^ 0xdeadbeef);
  const symbols = [...CARD_SYMBOLS, ...CARD_SYMBOLS]; // 16 cards, 8 pairs
  // Fisher-Yates shuffle
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }
  // Pick two distinct indices for power tiles
  const peekIdx = Math.floor(rng() * symbols.length);
  let boostIdx = Math.floor(rng() * (symbols.length - 1));
  if (boostIdx >= peekIdx) boostIdx++;

  return symbols.map((sym, i) => ({
    index: i,
    symbol: sym,
    power: i === peekIdx ? 'peek' : i === boostIdx ? 'boost' : null,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
  }));
}

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
  const [board, setBoard] = useState<CardState[]>([]);
  const [locked, setLocked] = useState(false);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME_LIMIT_MS / 1000);
  const [gameOver, setGameOver] = useState(false);
  const [peekActive, setPeekActive] = useState(false);
  const [burstText, setBurstText] = useState<string | null>(null);
  const [boostActive, setBoostActive] = useState(false);

  const startTimeRef = useRef<number>(Date.now());
  const gameOverRef = useRef(false);
  const matchedPairsRef = useRef(0);
  const mistakesRef = useRef(0);
  const turnsTakenRef = useRef(0);
  const streakBestRef = useRef(0);
  const finalisedRef = useRef(false);

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
    setBoard(buildBoard(seed));
    startTimeRef.current = Date.now();
    gameOverRef.current = false;
    finalisedRef.current = false;
    return () => {
      dispatch(resetHouseOfCards());
    };
  // Intentionally run only on mount: participants/seed/prizeType define the competition
  // session and must not change mid-game (restart would require a remount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Card flip handler ────────────────────────────────────────────────────
  const handleCardClick = useCallback(
    (cardIndex: number) => {
      if (locked || gameOver) return;
      const card = board[cardIndex];
      if (!card || card.isMatched || card.isFlipped) return;

      // Trigger power tile effect if applicable.
      if (card.power === 'peek' && !peekActive) {
        setPeekActive(true);
        // Reveal all unmatched cards briefly.
        setBoard((prev) =>
          prev.map((c) => (!c.isMatched ? { ...c, isFlipped: true } : c)),
        );
        // Snapshot the currently flipped indices in a Set for O(1) lookup when hiding.
        const flippedSet = new Set(flippedIndices);
        setTimeout(() => {
          setBoard((prev) =>
            prev.map((c) => (!c.isMatched && !flippedSet.has(c.index) ? { ...c, isFlipped: false } : c)),
          );
          setPeekActive(false);
        }, PEEK_DURATION_MS);
        return;
      }

      if (card.power === 'boost' && !boostActive) {
        setBoostActive(true);
        setBurstText('⚡ BOOST!');
        setTimeout(() => {
          setBurstText(null);
          setBoostActive(false);
        }, 1500);
        // Continue normal flip logic below (the boost scores double next match).
      }

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
          const newMatched = matchedPairsRef.current + 1;
          matchedPairsRef.current = newMatched;
          const newStreak = streak + 1;
          const newStreakBest = Math.max(newStreak, streakBestRef.current);
          streakBestRef.current = newStreakBest;

          newBoard[a] = { ...newBoard[a], isMatched: true, isFlipped: true };
          newBoard[b] = { ...newBoard[b], isMatched: true, isFlipped: true };

          const burstMsg =
            newStreak >= 3
              ? `🔥 ${newStreak}× STREAK!`
              : boostActive
              ? '⚡ DOUBLE MATCH!'
              : '✓ MATCH!';
          setBurstText(burstMsg);
          setTimeout(() => setBurstText(null), 600);

          setBoard(newBoard);
          setMatchedPairs(newMatched);
          setStreak(newStreak);
          setFlippedIndices([]);
          setLocked(false);

          if (newMatched >= TOTAL_PAIRS) {
            setGameOver(true);
          }
        } else {
          // Mismatch
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
    [board, locked, gameOver, flippedIndices, streak, boostActive, peekActive],
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
        placementsNode={
          <div className="hoc-standings" role="list" aria-label="Final standings">
            <div className="hoc-standings-label">Final Standings</div>
            {hoc.standings.map((outcome: PlayerOutcome) => {
              const isHuman = outcome.playerId === humanId;
              const isLast = outcome.playerId === lastPlace.playerId;
              const isWinner = outcome.playerId === winner.playerId;
              const rankIcon = RANK_ICONS[outcome.finalRank - 1] ?? `${outcome.finalRank}`;
              const rowClass = [
                'hoc-standing-row',
                isWinner ? 'hoc-standing--winner' : '',
                isLast && !isWinner ? 'hoc-standing--last' : '',
                isHuman ? 'hoc-standing--human' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={outcome.playerId} className={rowClass} role="listitem">
                  <span className="hoc-standing-rank">{rankIcon}</span>
                  <span
                    className={`hoc-standing-name${isHuman ? ' hoc-standing-name--human' : ''}`}
                  >
                    {nameFor(outcome.playerId)}
                  </span>
                  <div className="hoc-standing-details">
                    <span className="hoc-standing-score">{outcome.clashScore} pts</span>
                    <span className="hoc-standing-meta">
                      {outcome.matchedPairs}/{TOTAL_PAIRS} pairs ·{' '}
                      {outcome.mistakes} miss
                    </span>
                  </div>
                  {isHuman && !isLast && (
                    <span className="hoc-standing-badge hoc-badge--you">You</span>
                  )}
                  {isLast && !isWinner && (
                    <span className="hoc-standing-badge hoc-badge--last">Last</span>
                  )}
                </div>
              );
            })}
          </div>
        }
      >
        <div className="hoc-complete-title">🃏 House of Cards</div>
        <div className="hoc-complete-winner">
          <div className="hoc-complete-winner-trophy">
            {isHumanWinner ? '🏆 You Win!' : MEDALS[0]}
          </div>
          <div className="hoc-complete-winner-name">{winnerName}</div>
          <div className="hoc-complete-winner-score">{winner.clashScore} Clash Score</div>
        </div>
      </MinigameCompleteWrapper>
    );
  }

  // ── Compute AI progress for rail ────────────────────────────────────────
  const aiProgress = hoc?.aiOutcomes
    ? Object.entries(hoc.aiOutcomes).map(([id, outcome]) => ({
        id,
        name: nameFor(id),
        matched: outcome.matchedPairs,
        done: outcome.didFinish,
      }))
    : [];

  // Timer formatting
  const timerClass =
    timeLeft <= 5
      ? 'hoc-timer hoc-timer--danger'
      : timeLeft <= 15
      ? 'hoc-timer hoc-timer--warning'
      : 'hoc-timer';

  const allParticipants = [
    { id: humanId ?? '', name: nameFor(humanId ?? ''), matched: matchedPairs, done: matchedPairs >= TOTAL_PAIRS, isHuman: true },
    ...aiProgress.map((a) => ({ ...a, isHuman: false })),
  ].filter((p) => p.id);

  return (
    <div className="hoc-root">
      {/* HUD */}
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
      </div>

      {/* Progress rail */}
      <div className="hoc-rail" aria-label="Competition progress">
        <div className="hoc-rail-label">Progress</div>
        {allParticipants.map((p) => (
          <div key={p.id} className="hoc-rail-row">
            <span className={`hoc-rail-name${p.isHuman ? ' hoc-rail-name--human' : ''}`}>
              {p.isHuman ? 'You' : p.name.split(' ')[0]}
            </span>
            <div className="hoc-rail-bar-track">
              <div
                className={`hoc-rail-bar-fill${p.isHuman ? ' hoc-rail-bar--human' : ''}${p.done ? ' hoc-rail-bar--done' : ''}`}
                style={{ width: `${(p.matched / TOTAL_PAIRS) * 100}%` }}
              />
            </div>
            <span className="hoc-rail-pairs">{p.matched}/{TOTAL_PAIRS}</span>
          </div>
        ))}
      </div>

      {/* Card board */}
      <div className="hoc-board" role="grid" aria-label="Card grid">
        {board.map((card, i) => (
          <div
            key={i}
            className="hoc-card"
            data-flipped={card.isFlipped ? 'true' : 'false'}
            data-matched={card.isMatched ? 'true' : 'false'}
            data-mismatch={card.isMismatch ? 'true' : 'false'}
            data-locked={locked || card.isMatched ? 'true' : 'false'}
            data-power={card.power ?? undefined}
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
              </div>
              <div className="hoc-card-face hoc-card-front" aria-hidden="true">
                {card.symbol}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Burst animation */}
      {burstText && (
        <div className="hoc-match-burst" aria-hidden="true">
          <div
            className={`hoc-match-burst-text${
              burstText.includes('STREAK') || burstText.includes('BOOST')
                ? ' hoc-burst--streak'
                : ' hoc-burst--match'
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
