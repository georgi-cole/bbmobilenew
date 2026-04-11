/**
 * CodeBreakerComp — "Vault Cracker" competition minigame.
 *
 * Theme: Retro-futuristic vault/safe cracking.
 * Gameplay: Guess the 4-digit combination using deduction. Players have
 * unlimited guesses and unlimited time; scoring rewards both fewer attempts
 * and faster solves. Better feedback: 🟢 = exact position, 🟡 = right
 * digit/wrong place.
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
  DEFAULT_ELAPSED_SCORE_CAP_MS,
  evaluateGuess,
  generateSecretCode,
  computeSolvedScore,
  computeAllAiSolveProfiles,
  rankScores,
  type AiSolveProfile,
  type GuessResult,
} from './codeBreakerLogic';
import './CodeBreakerComp.css';

export type CodeBreakerPrizeType = 'LOH' | 'POS';

type GamePhase = 'playing' | 'solved' | 'results';
type VaultReaction = 'idle' | 'active' | 'reject';

const MEDALS = ['🥇', '🥈', '🥉'];
const RESULT_DELAY_MS = 1800;
const REACTION_RESET_MS = 550;
const ELAPSED_TICK_MS = 1000;

interface Props {
  participantIds?: string[];
  participants?: MinigameParticipant[];
  prizeType?: CodeBreakerPrizeType;
  seed?: number;
  onComplete?: (completion?: ReactMinigameCompletion) => void;
  onFinish?: (value: number) => void;
  autoStart?: boolean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getAttemptSummary(result: GuessResult): string {
  if (result.bulls === CODE_LENGTH) {
    return 'Tumblers aligned. Vault unlocked.';
  }
  if (result.bulls === 0 && result.cows === 0) {
    return 'Lock resisting. No tumblers aligned.';
  }

  const exactLabel = result.bulls === 1 ? '1 exact' : `${result.bulls} exact`;
  const closeLabel = result.cows === 1 ? '1 displaced' : `${result.cows} displaced`;
  return `${exactLabel} • ${closeLabel}`;
}

function formatAttemptCount(attempts: number): string {
  return `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`;
}

export default function CodeBreakerComp({
  participantIds = [],
  participants = [],
  prizeType = 'LOH',
  seed = 0,
  onComplete,
  onFinish,
  autoStart = false,
}: Props) {
  const dispatch = useAppDispatch();
  const isCompetitionMode = participantIds.length > 0;

  const [secretCode] = useState(() => generateSecretCode(seed));
  const humanParticipant = participants.find((p) => p.isHuman) ?? null;
  const humanId = humanParticipant?.id ?? null;
  const [{ aiSolveProfiles, aiScores }] = useState(() => {
    const profiles = computeAllAiSolveProfiles(
      seed,
      participantIds,
      humanId,
      DEFAULT_ELAPSED_SCORE_CAP_MS,
    );
    return {
      aiSolveProfiles: profiles as Record<string, AiSolveProfile>,
      aiScores: Object.fromEntries(
        Object.entries(profiles).map(([id, profile]) => [id, profile.score]),
      ) as Record<string, number>,
    };
  });

  const [currentDigits, setCurrentDigits] = useState<number[]>(Array(CODE_LENGTH).fill(0));
  const [guessHistory, setGuessHistory] = useState<GuessResult[]>([]);
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [humanScore, setHumanScore] = useState(0);
  const [vaultReaction, setVaultReaction] = useState<VaultReaction>('idle');

  const phaseRef = useRef<GamePhase>('playing');
  const elapsedMsRef = useRef(0);
  const guessHistoryRef = useRef<GuessResult[]>([]);
  const outcomeDispatchedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const elapsedTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reactionResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    elapsedMsRef.current = elapsedMs;
  }, [elapsedMs]);

  useEffect(() => {
    guessHistoryRef.current = guessHistory;
  }, [guessHistory]);

  const clearReactionReset = useCallback(() => {
    if (reactionResetRef.current !== null) {
      clearTimeout(reactionResetRef.current);
      reactionResetRef.current = null;
    }
  }, []);

  const stopElapsedTracking = useCallback(() => {
    if (elapsedTickerRef.current !== null) {
      clearInterval(elapsedTickerRef.current);
      elapsedTickerRef.current = null;
    }
  }, []);

  const getElapsedNow = useCallback(() => {
    if (startedAtRef.current === null) {
      return elapsedMsRef.current;
    }
    return Math.max(0, Date.now() - startedAtRef.current);
  }, []);

  const startElapsedTracking = useCallback(() => {
    if (phaseRef.current !== 'playing' || startedAtRef.current !== null) return;

    startedAtRef.current = Date.now() - elapsedMsRef.current;
    elapsedTickerRef.current = setInterval(() => {
      if (startedAtRef.current === null) return;
      setElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
    }, ELAPSED_TICK_MS);
  }, []);

  const triggerVaultReaction = useCallback(
    (reaction: VaultReaction) => {
      clearReactionReset();
      setVaultReaction(reaction);
      reactionResetRef.current = setTimeout(() => {
        setVaultReaction('idle');
        reactionResetRef.current = null;
      }, REACTION_RESET_MS);
    },
    [clearReactionReset],
  );

  useEffect(() => {
    if (autoStart || isCompetitionMode) {
      startElapsedTracking();
    }

    return () => {
      stopElapsedTracking();
      clearReactionReset();
    };
  }, [autoStart, clearReactionReset, isCompetitionMode, startElapsedTracking, stopElapsedTracking]);

  const changeDigit = useCallback(
    (index: number, delta: number) => {
      if (phaseRef.current !== 'playing') return;

      startElapsedTracking();
      setCurrentDigits((prev) => {
        const next = [...prev];
        next[index] = (next[index] + delta + 10) % 10;
        return next;
      });
      triggerVaultReaction('active');
    },
    [startElapsedTracking, triggerVaultReaction],
  );

  const handleSubmit = useCallback(() => {
    if (phaseRef.current !== 'playing') return;

    startElapsedTracking();
    const result = evaluateGuess(secretCode, currentDigits);
    const nextHistory = [...guessHistoryRef.current, result];
    setGuessHistory(nextHistory);

    if (result.bulls === CODE_LENGTH) {
      clearReactionReset();
      stopElapsedTracking();
      const finalElapsedMs = getElapsedNow();
      setElapsedMs(finalElapsedMs);
      const score = computeSolvedScore(nextHistory.length, finalElapsedMs);

      if (!outcomeDispatchedRef.current && isCompetitionMode) {
        outcomeDispatchedRef.current = true;
        const allScores: Record<string, number> = { ...aiScores };
        if (humanId) allScores[humanId] = score;

        const ranked = rankScores(allScores, participantIds);
        const winnerId = ranked[0]?.id ?? participantIds[0];
        const lastPlaceId = ranked[ranked.length - 1]?.id ?? null;
        const validLastPlace =
          lastPlaceId !== null && lastPlaceId !== winnerId ? lastPlaceId : null;

        const competitionPhase = prizeType === 'LOH' ? 'loh_comp' : 'pos_comp';
        if (import.meta.env.DEV) {
          console.log(`[CodeBreaker] Resolving ${competitionPhase}:`, {
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

      setHumanScore(score);
      setPhase('solved');
      setVaultReaction('idle');
      return;
    }

    triggerVaultReaction('reject');
  }, [
    clearReactionReset,
    currentDigits,
    aiScores,
    dispatch,
    getElapsedNow,
    humanId,
    isCompetitionMode,
    participantIds,
    prizeType,
    secretCode,
    startElapsedTracking,
    stopElapsedTracking,
    triggerVaultReaction,
  ]);

  useEffect(() => {
    if (phase !== 'solved') return undefined;

    const timeout = setTimeout(() => {
      if (onFinish) {
        onFinish(humanScore);
      } else {
        setPhase('results');
      }
    }, RESULT_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [humanScore, onFinish, phase]);

  const handleContinue = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const isDone = phase === 'solved';
  const attempts = guessHistory.length;
  const lastGuess = guessHistory[guessHistory.length - 1];
  const bestBulls = guessHistory.reduce((max, guess) => Math.max(max, guess.bulls), 0);
  const elapsedLabel = formatElapsed(elapsedMs);
  const vaultStateLabel = phase === 'solved' ? 'Opened' : attempts > 0 ? 'Cracking' : 'Locked';
  const statusText =
    phase === 'solved'
      ? `Vault breached in ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}`
      : lastGuess
        ? getAttemptSummary(lastGuess)
        : 'Dial the tumblers and test the mechanism';
  const hintText =
    phase === 'solved'
      ? `${elapsedLabel} Elapsed • Score ${humanScore}`
      : attempts > 0
        ? `Best alignment so far: ${bestBulls}/${CODE_LENGTH} exact`
        : 'Unlimited attempts. Higher scores come from solving in fewer tries and less time.';

  const statusCls = [
    'cb__status',
    phase === 'solved' ? 'cb__status--success' : '',
    vaultReaction === 'reject' ? 'cb__status--fail' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const vaultDoorCls = [
    'cb__vault-door',
    phase === 'solved' || phase === 'results' ? 'cb__vault-door--solved' : '',
    vaultReaction === 'active' ? 'cb__vault-door--active' : '',
    vaultReaction === 'reject' ? 'cb__vault-door--reject' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const leaderboard = (() => {
    if (phase !== 'results') return [];
    const allScores: Record<string, number> = { ...aiScores };
    if (humanId) allScores[humanId] = humanScore;
    return rankScores(allScores, participantIds).map((entry) => {
      const participant = participants.find((candidate) => candidate.id === entry.id);
      const isYou = entry.id === humanId;
      const solveProfile = isYou
        ? { attempts, elapsedMs, score: humanScore }
        : aiSolveProfiles[entry.id];
      return {
        ...entry,
        participantName: participant?.name ?? entry.id,
        isYou,
        solveProfile,
      };
    });
  })();

  if (phase === 'results') {
    return (
      <div className="cb">
        <div className="cb__header">
          <h2 className="cb__title">Vault Cracker</h2>
          <div className="cb__stats-panel cb__stats-panel--results">
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Attempts</span>
              <strong className="cb__stat-value">{attempts}</strong>
            </div>
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Elapsed</span>
              <strong className="cb__stat-value">{elapsedLabel}</strong>
            </div>
            <div className="cb__stat-chip">
              <span className="cb__stat-label">Score</span>
              <strong className="cb__stat-value">{humanScore}</strong>
            </div>
          </div>
          <p className="cb__code-reveal">
            Code was: <strong>{secretCode.join('')}</strong>
          </p>
        </div>

        <div className="cb__results">
          <p className="cb__results-headline">🔓 Vault Cracked!</p>
          <p className="cb__results-subhead">
            Your run now ranks by score, based on attempts and elapsed time.
          </p>

          <ol className="cb__leaderboard">
            {leaderboard.map((entry, i) => {
              const isWinner = i === 0;
              const isLast = i === leaderboard.length - 1;
              const cls = [
                'cb__lb-entry',
                isWinner ? 'cb__lb-entry--winner' : '',
                isLast ? 'cb__lb-entry--last' : '',
                entry.isYou ? 'cb__lb-entry--you' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <li key={entry.id} className={cls}>
                  <span className="cb__lb-rank">
                    {i < 3 ? MEDALS[i] : `${i + 1}.`}
                  </span>
                  <span className="cb__lb-details">
                    <span className="cb__lb-name">
                      {entry.participantName}
                      {entry.isYou ? ' (You)' : ''}
                    </span>
                    {entry.solveProfile && (
                      <span className="cb__lb-meta">
                        {formatAttemptCount(entry.solveProfile.attempts)} • {formatElapsed(entry.solveProfile.elapsedMs)}
                      </span>
                    )}
                  </span>
                  <span className="cb__lb-score-wrap">
                    <span className="cb__lb-score-label">Score</span>
                    <span className="cb__lb-score">{entry.score}</span>
                  </span>
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

  return (
    <div className="cb">
      <div className="cb__header">
        <h2 className="cb__title">Vault Cracker</h2>
        <div className="cb__stats-panel" aria-label="Vault status">
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Status</span>
            <strong className="cb__stat-value">{vaultStateLabel}</strong>
          </div>
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Attempts</span>
            <strong className="cb__stat-value">{attempts}</strong>
          </div>
          <div className="cb__stat-chip">
            <span className="cb__stat-label">Elapsed</span>
            <strong className="cb__stat-value">{elapsedLabel}</strong>
          </div>
        </div>
      </div>

      <div className="cb__vault-wrap">
        <div className={vaultDoorCls}>
          <div className="cb__vault-ring cb__vault-ring--outer" />
          <div className="cb__vault-ring cb__vault-ring--inner" />
          <div className="cb__vault-core">
            <div className="cb__vault-handle" />
            <div className="cb__vault-light" />
          </div>
        </div>
      </div>

      <div className="cb__status-card" aria-live="polite">
        <p className={statusCls}>{statusText}</p>
        <p className="cb__hint">{hintText}</p>
      </div>

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
              <div
                className="cb__dial-window"
                role="img"
                aria-label={`Digit ${i + 1}: ${digit}`}
              >
                <span className="cb__dial-preview" aria-hidden="true">{(digit + 9) % 10}</span>
                <span className="cb__dial-digit">{digit}</span>
                <span className="cb__dial-preview" aria-hidden="true">{(digit + 1) % 10}</span>
              </div>
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
          Test Combination
        </button>
      </div>

      <div className="cb__history">
        <div className="cb__history-head">
          <div className="cb__history-label">Attempt History</div>
          <div className="cb__history-count">{attempts} logged</div>
        </div>
        <div className="cb__history-list">
          {guessHistory.length === 0 ? (
            <div className="cb__history-empty">
              No tumbler reads yet. Each test will log exact matches and displaced digits here.
            </div>
          ) : (
            guessHistory.map((entry, i) => {
              const pips = Array.from({ length: CODE_LENGTH }, (_, k) => {
                if (k < entry.bulls) return 'bull';
                if (k < entry.bulls + entry.cows) return 'cow';
                return 'miss';
              });

              return (
                <div key={i} className="cb__guess-row">
                  <div className="cb__guess-main">
                    <span className="cb__guess-meta">Attempt {i + 1}</span>
                    <span className="cb__guess-digits">{entry.digits.join('')}</span>
                    <span className="cb__guess-summary">{getAttemptSummary(entry)}</span>
                  </div>
                  <div className="cb__guess-feedback">
                    {pips.map((type, k) => (
                      <div key={k} className={`cb__pip cb__pip--${type}`} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
