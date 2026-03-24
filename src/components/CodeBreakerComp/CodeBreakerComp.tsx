/**
 * CodeBreakerComp — "Vault Cracker" competition minigame.
 *
 * Theme: Retro-futuristic vault/safe cracking.
 * Gameplay: Guess the 4-digit combination using deduction. Timer pressure
 *   replaces the old attempt cap — you get unlimited guesses within 60 s.
 *   Better feedback: 🟢 = exact position, 🟡 = right digit/wrong place.
 *
 * Scoring:
 *   Solved   → 30 + round(70 × timeRemainingMs / timeLimitMs)   [range 30–100]
 *   Unsolved → bestBulls × 4                                    [range 0–12]
 *
 * All solved players outrank all unsolved players regardless of timing.
 *
 * Supports two mounting paths:
 *   1. Competition path (MinigameHost special-case):
 *      Receives participantIds + participants + prizeType + seed + onComplete.
 *      Computes AI scores from seed, dispatches applyMinigameWinner, then
 *      calls onComplete.
 *   2. Generic onFinish path (reactComponents map):
 *      Receives seed + onFinish; calls onFinish(humanScore) when done.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAppDispatch } from '../../store/hooks';
import { applyMinigameWinner } from '../../store/gameSlice';
import type { ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import {
  CODE_LENGTH,
  DEFAULT_TIME_LIMIT_MS,
  SOLVED_SCORE_FLOOR,
  evaluateGuess,
  generateSecretCode,
  computeSolvedScore,
  computeUnsolvedScore,
  computeAllAiScores,
  rankScores,
  type GuessResult,
} from './codeBreakerLogic';
import './CodeBreakerComp.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CodeBreakerPrizeType = 'HOH' | 'POV';

type GamePhase = 'playing' | 'solved' | 'expired' | 'results';

const MEDALS = ['🥇', '🥈', '🥉'];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Competition path: all participant IDs. */
  participantIds?: string[];
  /** Competition path: participant metadata (name, isHuman, etc.). */
  participants?: MinigameParticipant[];
  /** Competition path: HOH or POV. */
  prizeType?: CodeBreakerPrizeType;
  /** Seeded-RNG master seed forwarded from gameOptions. */
  seed?: number;
  /** Competition path: called when done (after results screen). */
  onComplete?: (completion?: ReactMinigameCompletion) => void;
  /** Generic path: called immediately with the human's score. */
  onFinish?: (value: number) => void;
  /** When true game starts immediately (no extra click needed). */
  autoStart?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CodeBreakerComp({
  participantIds = [],
  participants = [],
  prizeType = 'HOH',
  seed = 0,
  onComplete,
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const isCompetitionMode = participantIds.length > 0;

  const timeLimitMs = DEFAULT_TIME_LIMIT_MS;

  // ── Secret code (stable for this mount) ───────────────────────────────────
  const secretCode = useRef<number[]>(generateSecretCode(seed));

  // ── AI scores (stable for this mount) ─────────────────────────────────────
  const humanParticipant = participants.find((p) => p.isHuman) ?? null;
  const humanId = humanParticipant?.id ?? null;
  const aiScores = useRef<Record<string, number>>(
    computeAllAiScores(seed, participantIds, humanId, timeLimitMs),
  );

  // ── Game state ─────────────────────────────────────────────────────────────
  const [currentDigits, setCurrentDigits] = useState<number[]>(Array(CODE_LENGTH).fill(0));
  const [guessHistory, setGuessHistory] = useState<GuessResult[]>([]);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [timeRemainingMs, setTimeRemainingMs] = useState(timeLimitMs);
  const [humanScore, setHumanScore] = useState(0);
  const [outcomeDispatched, setOutcomeDispatched] = useState(false);

  // Ref to access latest values in interval callback without stale closures
  const timeRemainingRef = useRef(timeLimitMs);
  const phaseRef = useRef<GamePhase>('playing');
  const guessHistoryRef = useRef<GuessResult[]>([]);

  timeRemainingRef.current = timeRemainingMs;
  phaseRef.current = phase;
  guessHistoryRef.current = guessHistory;

  // ── Timer ──────────────────────────────────────────────────────────────────
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTimerExpire = useCallback(() => {
    stopTimer();
    if (phaseRef.current !== 'playing') return;
    const history = guessHistoryRef.current;
    const bestBulls = history.reduce((max, g) => Math.max(max, g.bulls), 0);
    const score = computeUnsolvedScore(bestBulls);
    setHumanScore(score);
    setPhase('expired');
  }, [stopTimer]);

  useEffect(() => {
    if (!autoStart && !isCompetitionMode) return;

    const TICK_MS = 100;
    timerRef.current = setInterval(() => {
      const newTime = timeRemainingRef.current - TICK_MS;
      if (newTime <= 0) {
        setTimeRemainingMs(0);
        handleTimerExpire();
      } else {
        setTimeRemainingMs(newTime);
      }
    }, TICK_MS);

    return stopTimer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Digit controls ─────────────────────────────────────────────────────────
  const changeDigit = useCallback((index: number, delta: number) => {
    if (phaseRef.current !== 'playing') return;
    setCurrentDigits((prev) => {
      const next = [...prev];
      next[index] = (next[index] + delta + 10) % 10;
      return next;
    });
  }, []);

  // ── Submit guess ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    const result = evaluateGuess(secretCode.current, currentDigits);
    const nextHistory = [...guessHistoryRef.current, result];
    setGuessHistory(nextHistory);

    if (result.bulls === CODE_LENGTH) {
      // Code cracked!
      stopTimer();
      const score = computeSolvedScore(timeRemainingRef.current, timeLimitMs);
      setHumanScore(score);
      setPhase('solved');
    }
  }, [currentDigits, timeLimitMs, stopTimer]);

  // ── Resolve competition outcome ────────────────────────────────────────────
  const resolveOutcome = useCallback(
    (finalHumanScore: number) => {
      if (outcomeDispatched) return;
      setOutcomeDispatched(true);

      if (isCompetitionMode) {
        // Build full scores including human
        const allScores: Record<string, number> = { ...aiScores.current };
        if (humanId) allScores[humanId] = finalHumanScore;

        const ranked = rankScores(allScores, participantIds);
        const winnerId = ranked[0]?.id ?? participantIds[0];
        const lastPlaceId = ranked[ranked.length - 1]?.id ?? null;
        const validLastPlace =
          lastPlaceId !== null && lastPlaceId !== winnerId ? lastPlaceId : null;

        const phase = prizeType === 'HOH' ? 'hoh_comp' : 'pov_comp';
        if (import.meta.env.DEV) {
          console.log(`[CodeBreaker] Resolving ${phase}:`, {
            winnerId,
            lastPlaceId: validLastPlace,
            scores: allScores,
          });
        }

        dispatch(
          applyMinigameWinner({
            winnerId,
            participants: participantIds,
            scores: allScores,
            lastPlaceId: validLastPlace,
            lastPlaceType: 'scored',
          }),
        );
      }
    },
    [outcomeDispatched, isCompetitionMode, aiScores, humanId, participantIds, prizeType, dispatch],
  );

  // ── Transition to results ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'solved' || phase === 'expired') {
      resolveOutcome(humanScore);

      const timeout = setTimeout(() => {
        if (onFinish) {
          // Generic path — report score immediately
          onFinish(humanScore);
        } else {
          // Competition path — show results screen
          setPhase('results');
        }
      }, 1800);
      return () => clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Continue from results ──────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  // ── Derive results leaderboard ─────────────────────────────────────────────
  const leaderboard = (() => {
    if (phase !== 'results') return [];
    const allScores: Record<string, number> = { ...aiScores.current };
    if (humanId) allScores[humanId] = humanScore;
    return rankScores(allScores, participantIds);
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  const timerPct = (timeRemainingMs / timeLimitMs) * 100;
  const isUrgent = timeRemainingMs <= 15_000 && phase === 'playing';
  const timeLabel = `${Math.ceil(timeRemainingMs / 1000)}s`;
  const isDone = phase === 'solved' || phase === 'expired';
  const vaultSolvedCls = phase === 'solved' || phase === 'results' ? 'cb__vault-door--solved' : '';
  const vaultFailedCls = phase === 'expired' ? 'cb__vault-door--failed' : '';

  if (phase === 'results') {
    // ── Results screen ─────────────────────────────────────────────────────
    return (
      <div className="cb">
        <div className="cb__header">
          <h2 className="cb__title">Vault Cracker</h2>
          <p className="cb__code-reveal">
            Code was:{' '}
            <strong>{secretCode.current.join('')}</strong>
          </p>
        </div>

        <div className="cb__results">
          <p className="cb__results-headline">
            {humanScore >= SOLVED_SCORE_FLOOR ? '🔓 Vault Cracked!' : '🔒 Time Expired'}
          </p>

          <ol className="cb__leaderboard">
            {leaderboard.map((entry, i) => {
              const p = participants.find((pp) => pp.id === entry.id);
              const isWinner = i === 0;
              const isLast = i === leaderboard.length - 1;
              const isYou = entry.id === humanId;
              const cls = [
                'cb__lb-entry',
                isWinner ? 'cb__lb-entry--winner' : '',
                isLast ? 'cb__lb-entry--last' : '',
                isYou ? 'cb__lb-entry--you' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <li key={entry.id} className={cls}>
                  <span className="cb__lb-rank">
                    {i < 3 ? MEDALS[i] : `${i + 1}.`}
                  </span>
                  <span className="cb__lb-name">
                    {p?.name ?? entry.id}
                    {isYou ? ' (You)' : ''}
                  </span>
                  <span className="cb__lb-score">{entry.score}</span>
                </li>
              );
            })}
          </ol>

          <button className="cb__continue-btn" onClick={handleContinue}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Playing / solved / expired screen ─────────────────────────────────────
  const statusText = (() => {
    if (phase === 'solved') return `🔓 Code cracked! Score: ${humanScore}`;
    if (phase === 'expired') return `🔒 Time's up! Code: ${secretCode.current.join('')}`;
    const last = guessHistory[guessHistory.length - 1];
    if (last) return `${last.bulls} exact  ·  ${last.cows} close`;
    return 'Adjust the dials and submit your guess';
  })();

  const statusCls = [
    'cb__status',
    phase === 'solved' ? 'cb__status--success' : '',
    phase === 'expired' ? 'cb__status--fail' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="cb">
      {/* Header */}
      <div className="cb__header">
        <h2 className="cb__title">Vault Cracker</h2>

        {/* Timer */}
        <div className="cb__timer-wrap">
          <div className="cb__timer-bar">
            <div
              className={`cb__timer-fill${isUrgent ? ' cb__timer-fill--urgent' : ''}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <div className={`cb__timer-label${isUrgent ? ' cb__timer-label--urgent' : ''}`}>
            {timeLabel}
          </div>
        </div>
      </div>

      {/* Vault door visual */}
      <div className="cb__vault-wrap">
        <div className={`cb__vault-door ${vaultSolvedCls} ${vaultFailedCls}`}>
          <div className="cb__vault-handle" />
        </div>
      </div>

      {/* Status feedback */}
      <p className={statusCls}>{statusText}</p>

      {/* Digit input dials */}
      <div className="cb__input-section">
        <div className="cb__dials">
          {currentDigits.map((digit, i) => (
            <div key={i} className="cb__dial">
              <button
                className="cb__dial-btn"
                onClick={() => changeDigit(i, +1)}
                disabled={isDone}
                aria-label={`Increase digit ${i + 1}`}
              >
                ▲
              </button>
              <div className="cb__dial-digit">{digit}</div>
              <button
                className="cb__dial-btn"
                onClick={() => changeDigit(i, -1)}
                disabled={isDone}
                aria-label={`Decrease digit ${i + 1}`}
              >
                ▼
              </button>
            </div>
          ))}
        </div>

        <button
          className="cb__submit-btn"
          onClick={handleSubmit}
          disabled={isDone}
        >
          Try Combination
        </button>
      </div>

      {/* Guess history */}
      {guessHistory.length > 0 && (
        <div className="cb__history">
          <div className="cb__history-label">Attempt History</div>
          <div className="cb__history-list">
            {guessHistory.map((entry, i) => {
              const pips = Array.from({ length: CODE_LENGTH }, (_, k) => {
                if (k < entry.bulls) return 'bull';
                if (k < entry.bulls + entry.cows) return 'cow';
                return 'miss';
              });
              return (
                <div key={i} className="cb__guess-row">
                  <span className="cb__guess-digits">{entry.digits.join('')}</span>
                  <div className="cb__guess-feedback">
                    {pips.map((type, k) => (
                      <div key={k} className={`cb__pip cb__pip--${type}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
