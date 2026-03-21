/**
 * WildcardWesternComp.tsx – Main React component for Wildcard Western.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../store/store';
import type { MinigameParticipant, ReactMinigameCompletion } from '../MinigameHost/MinigameHost';
import {
  initWildcardWestern,
  advanceIntro,
  dealCardsAction,
  advanceCardReveal,
  advancePairIntro,
  openBuzzWindow,
  playerBuzz,
  buzzTimeout,
  playerAnswer,
  answerTimeout,
  advanceResolution,
  playerChooseElimination,
  playerChooseNextPair,
  randomPairChosen,
  advanceGameOver,
  resetWildcardWestern,
} from '../../features/wildcardWestern/wildcardWesternSlice';
import { WILDCARD_QUESTIONS } from '../../features/wildcardWestern/wildcardWesternQuestions';
import {
  getAiPersonality,
  precomputeAiDuelPlan,
  precomputeAiEliminationChoice,
  precomputeAiNextPair,
} from '../../features/wildcardWestern/wildcardWesternAi';
import { resolveWildcardWesternOutcome } from '../../features/wildcardWestern/thunks';
import { useWildcardWesternAudio } from '../../hooks/useWildcardWesternAudio';
import './WildcardWesternComp.css';

// ─── Timing constants ──────────────────────────────────────────────────────────
/** Delay before AI submits its answer after buzzing. */
const AI_ANSWER_DELAY_MS = 1500;
/** Delay before AI chooses who to eliminate. */
const AI_ELIMINATION_DELAY_MS = 2000;
/** Delay before AI chooses the next pair. */
const AI_PAIR_CHOICE_DELAY_MS = 2000;
/** Delay before random pair selection resolves. */
const RANDOM_PAIR_DELAY_MS = 1500;
/** Duration to display the winner screen before auto-proceeding (ms). */
const WINNER_DISPLAY_DURATION_MS = 3000;
/** Brief delay between question reveal and opening the draw window. */
const QUESTION_REVEAL_DELAY_MS = 700;
/** Brief intro beat before the automatic final duel begins. */
const FINAL_DUEL_INTRO_DELAY_MS = 1000;

interface WildcardWesternCompProps {
  participantIds: string[];
  participants?: MinigameParticipant[];
  prizeType?: 'HOH' | 'POV';
  seed: number;
  onComplete?: (completion?: ReactMinigameCompletion) => void;
  standalone?: boolean;
}

export default function WildcardWesternComp({
  participantIds,
  participants = [],
  prizeType = 'HOH',
  seed,
  onComplete,
  standalone = false,
}: WildcardWesternCompProps) {
  const dispatch = useDispatch<AppDispatch>();
  const state = useSelector((root: RootState) => root.wildcardWestern);

  const [timeRemaining, setTimeRemaining] = useState(0);

  const timeoutIdsRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef(state.phase);
  const completionReportedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  const clearScheduledTimeouts = useCallback(() => {
    for (const timeoutId of timeoutIdsRef.current) {
      clearTimeout(timeoutId);
    }
    timeoutIdsRef.current.clear();
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);
    timeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const { playSelect, playDraw, playEliminated, playWinner, playContinue, playNewRound } =
    useWildcardWesternAudio(state.phase !== 'idle');

  // Play elimination sound when a player is eliminated (resolution phase shows outcome).
  const lastEliminatedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'resolution') return;
    if (!state.lastEliminatedId) return;
    if (state.lastEliminatedId === lastEliminatedIdRef.current) return;
    lastEliminatedIdRef.current = state.lastEliminatedId;
    playEliminated();
  }, [playEliminated, state.lastEliminatedId, state.phase]);

  // Play winner sound when the game-over screen appears.
  const winnerSoundPlayedRef = useRef(false);
  useEffect(() => {
    if (state.phase !== 'gameOver') return;
    if (winnerSoundPlayedRef.current) return;
    winnerSoundPlayedRef.current = true;
    playWinner();
  }, [playWinner, state.phase]);

  // Play new-round cue on each new pairIntro.
  const lastDuelForNewRoundRef = useRef(-1);
  useEffect(() => {
    if (state.phase !== 'pairIntro') return;
    if (state.duelNumber === lastDuelForNewRoundRef.current) return;
    lastDuelForNewRoundRef.current = state.duelNumber;
    playNewRound();
  }, [playNewRound, state.duelNumber, state.phase]);

  const participantMap = useRef<Map<string, MinigameParticipant>>(new Map());
  useEffect(() => {
    participantMap.current = new Map(participants.map((p) => [p.id, p]));
  }, [participants]);

  const getParticipantName = (id: string) => {
    return participantMap.current.get(id)?.name ?? id;
  };

  const isHuman = (id: string) => {
    return participantMap.current.get(id)?.isHuman ?? false;
  };

  const humanPlayerId = participants.find((p) => p.isHuman)?.id ?? null;
  const buildCompletion = useCallback((): ReactMinigameCompletion | undefined => {
    if (!state.winnerId) return undefined;
    return {
      authoritativeWinnerId: state.winnerId,
    };
  }, [state.winnerId]);
  const isHostedGameOver = state.phase === 'gameOver' && !standalone;
  const shouldResolveHostedOutcome =
    isHostedGameOver && !!state.winnerId && !state.outcomeResolved;
  const shouldNotifyHostedCompletion =
    isHostedGameOver
    && !!state.winnerId
    && state.outcomeResolved
    && !completionReportedRef.current;

  useEffect(() => {
    completionReportedRef.current = false;
    dispatch(
      initWildcardWestern({
        participantIds,
        prizeType,
        seed,
        humanPlayerId,
      }),
    );

    return () => {
      clearScheduledTimeouts();
      dispatch(resetWildcardWestern());
    };
  // Wildcard Western sessions should initialize only once per mount; the
  // parent provides a new component instance for each new game.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear timers on phase change
  useEffect(() => {
    clearScheduledTimeouts();
    if (state.phase !== 'buzzOpen' && state.phase !== 'answerOpen') {
      setTimeRemaining(0);
    }
  }, [clearScheduledTimeouts, state.phase]);

  // Buzz timer
  useEffect(() => {
    if (state.phase === 'buzzOpen' && state.buzzWindowUntil > 0) {
      const updateTimer = () => {
        const remaining = Math.max(0, state.buzzWindowUntil - Date.now());
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          if (phaseRef.current === 'buzzOpen') {
            dispatch(buzzTimeout());
          }
        } else {
          scheduleTimeout(updateTimer, 100);
        }
      };
      updateTimer();
    }
  }, [dispatch, scheduleTimeout, state.buzzWindowUntil, state.phase]);

  // Answer timer
  useEffect(() => {
    if (state.phase === 'answerOpen' && state.answerWindowUntil > 0) {
      const updateTimer = () => {
        const remaining = Math.max(0, state.answerWindowUntil - Date.now());
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          if (phaseRef.current === 'answerOpen') {
            dispatch(answerTimeout());
          }
        } else {
          scheduleTimeout(updateTimer, 100);
        }
      };
      updateTimer();
    }
  }, [dispatch, scheduleTimeout, state.answerWindowUntil, state.phase]);

  // Brief question reveal beat before buzzing opens.
  useEffect(() => {
    if (state.phase !== 'duelQuestion') return;
    scheduleTimeout(() => {
      if (phaseRef.current === 'duelQuestion') {
        dispatch(openBuzzWindow());
      }
    }, QUESTION_REVEAL_DELAY_MS);
  }, [dispatch, scheduleTimeout, state.phase]);

  // Final duel begins automatically once only two players remain.
  useEffect(() => {
    if (state.phase !== 'finalDuel') return;
    scheduleTimeout(() => {
      if (phaseRef.current === 'finalDuel') {
        dispatch(advancePairIntro());
      }
    }, FINAL_DUEL_INTRO_DELAY_MS);
  }, [dispatch, scheduleTimeout, state.phase]);

  // AI buzz logic
  useEffect(() => {
    if (state.phase !== 'buzzOpen') return;
    if (!state.currentPair) return;

    const question = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
    if (!question) return;

    const [p1, p2] = state.currentPair;

    const scheduleAiBuzz = (playerId: string) => {
      if (isHuman(playerId)) return;

      const personality = getAiPersonality(playerId, seed);
      const plan = precomputeAiDuelPlan(playerId, personality, question, seed, state.duelNumber);

      if (plan.willBuzz) {
        scheduleTimeout(() => {
          if (phaseRef.current === 'buzzOpen') {
            dispatch(playerBuzz({ playerId }));
          }
        }, plan.buzzDelayMs);
      }
    };

    if (!isHuman(p1)) scheduleAiBuzz(p1);
    if (!isHuman(p2)) scheduleAiBuzz(p2);
  }, [dispatch, scheduleTimeout, seed, state.currentPair, state.currentQuestionId, state.duelNumber, state.phase]);

  // AI answer logic
  useEffect(() => {
    if (state.phase !== 'answerOpen') return;
    if (!state.buzzedBy) return;
    if (isHuman(state.buzzedBy)) return;

    const question = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
    if (!question) return;

    const personality = getAiPersonality(state.buzzedBy, seed);
    const plan = precomputeAiDuelPlan(state.buzzedBy, personality, question, seed, state.duelNumber);

    if (plan.willAnswer) {
      scheduleTimeout(() => {
        if (phaseRef.current === 'answerOpen') {
          dispatch(playerAnswer({ answerIndex: plan.chosenAnswerIndex }));
        }
      }, AI_ANSWER_DELAY_MS);
    }
  }, [dispatch, scheduleTimeout, seed, state.buzzedBy, state.currentQuestionId, state.duelNumber, state.phase]);

  // AI elimination choice
  useEffect(() => {
    if (state.phase !== 'chooseElimination') return;
    if (!state.eliminationChooserId) return;
    if (isHuman(state.eliminationChooserId)) return;

    const targetId = precomputeAiEliminationChoice(
      state.eliminationChooserId,
      state.aliveIds,
      seed,
      state.duelNumber,
    );

    scheduleTimeout(() => {
      if (phaseRef.current === 'chooseElimination') {
        dispatch(playerChooseElimination({ targetId }));
      }
    }, AI_ELIMINATION_DELAY_MS);
  }, [dispatch, scheduleTimeout, seed, state.aliveIds, state.duelNumber, state.eliminationChooserId, state.phase]);

  // AI next pair choice
  useEffect(() => {
    if (state.phase !== 'chooseNextPair') return;
    if (!state.controllerId) return;
    if (isHuman(state.controllerId)) return;

    const pair = precomputeAiNextPair(state.controllerId, state.aliveIds, seed, state.duelNumber);

    scheduleTimeout(() => {
      if (phaseRef.current === 'chooseNextPair') {
        dispatch(playerChooseNextPair({ pair }));
      }
    }, AI_PAIR_CHOICE_DELAY_MS);
  }, [dispatch, scheduleTimeout, seed, state.aliveIds, state.controllerId, state.duelNumber, state.phase]);

  // Auto-advance randomPairSelection
  useEffect(() => {
    if (state.phase !== 'randomPairSelection') return;
    scheduleTimeout(() => {
      if (phaseRef.current === 'randomPairSelection') {
        dispatch(randomPairChosen());
      }
    }, RANDOM_PAIR_DELAY_MS);
  }, [dispatch, scheduleTimeout, state.phase]);

  useEffect(() => {
    if (!shouldResolveHostedOutcome) return;
    dispatch(resolveWildcardWesternOutcome());
  }, [dispatch, shouldResolveHostedOutcome]);

  useEffect(() => {
    if (!shouldNotifyHostedCompletion) return;
    completionReportedRef.current = true;
    scheduleTimeout(() => {
      onCompleteRef.current?.(buildCompletion());
    }, WINNER_DISPLAY_DURATION_MS);
  }, [buildCompletion, scheduleTimeout, shouldNotifyHostedCompletion]);

  // Render
  const currentQuestion = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);

  return (
    <div className="wildcard-western-root">
      {/* Header */}
      <div className="ww-header">
        <div className="ww-title">⭐ Wildcard Western ⭐</div>
        {import.meta.env.DEV && <div className="ww-seed">seed: {seed}</div>}
      </div>

      {/* Content */}
      <div className="ww-content">
        {state.phase === 'intro' && (
          <div className="ww-intro">
            <h2>Welcome to the Wild West!</h2>
            <p>
              Draw your wildcard. Face off in showdowns. Answer correctly or face elimination.
              Last sheriff standing wins!
            </p>
            <button className="ww-btn" onClick={() => { playSelect(); dispatch(advanceIntro()); }}>
              Draw Cards
            </button>
          </div>
        )}

        {state.phase === 'cardDeal' && (
          <div className="ww-intro">
            <h2>Dealing Cards...</h2>
            <button className="ww-btn" onClick={() => { playSelect(); dispatch(dealCardsAction()); }}>
              Reveal Cards
            </button>
          </div>
        )}

        {state.phase === 'cardReveal' && (
          <div style={{ width: '100%', maxWidth: 800 }}>
            <h2 style={{ textAlign: 'center', marginBottom: '2rem', color: '#d4a017' }}>
              Your Wildcards
            </h2>
            <div className="ww-card-grid">
              {state.participantIds.map((id) => {
                const cardValue = state.cardsByPlayerId[id] ?? 0;
                const isAlive = state.aliveIds.includes(id);
                return (
                  <div key={id} className="ww-player-card">
                    <div className="ww-player-name">{getParticipantName(id)}</div>
                    <div className="ww-card-value">{cardValue}</div>
                    {!isAlive && <div className="ww-card-status">ELIMINATED</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button className="ww-btn" onClick={() => { playSelect(); dispatch(advanceCardReveal()); }}>
                Start Showdown
              </button>
            </div>
          </div>
        )}

        {state.phase === 'pairIntro' && (
          <div className="ww-duel-container">
            <div className="ww-duel-header">
              <div className="ww-duel-title">High Noon Showdown</div>
              <div className="ww-duel-pair">
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[0] ?? '')}</div>
                <div className="ww-vs">VS</div>
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[1] ?? '')}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="ww-btn" onClick={() => { playSelect(); dispatch(advancePairIntro()); }}>
                Begin Duel
              </button>
            </div>
          </div>
        )}

        {state.phase === 'finalDuel' && (
          <div className="ww-duel-container">
            <div className="ww-duel-header">
              <div className="ww-duel-title">Final Duel</div>
              <div className="ww-duel-pair">
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[0] ?? '')}</div>
                <div className="ww-vs">VS</div>
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[1] ?? '')}</div>
              </div>
            </div>
            <p style={{ textAlign: 'center', fontSize: '1.15rem', opacity: 0.9 }}>
              Only two gunslingers remain. The last showdown begins automatically…
            </p>
          </div>
        )}

        {(state.phase === 'duelQuestion' || state.phase === 'buzzOpen') && currentQuestion && (
          <div className="ww-duel-container">
            <div className="ww-duel-header">
              <div className="ww-duel-pair">
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[0] ?? '')}</div>
                <div className="ww-vs">VS</div>
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[1] ?? '')}</div>
              </div>
            </div>

            <div className="ww-question-box">
              <div className="ww-question-text">{currentQuestion.prompt}</div>
              <div className="ww-answer-grid">
                {currentQuestion.options.map((opt, idx) => (
                  <button key={idx} className="ww-answer-btn" disabled>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {state.phase === 'duelQuestion' && (
              <div className="ww-buzz-section">
                <div style={{ fontSize: '1.2rem', color: '#d4a017', fontWeight: 700 }}>
                  Hands up… the draw opens in a heartbeat.
                </div>
              </div>
            )}

            {state.phase === 'buzzOpen' && (
              <div className="ww-buzz-section">
                {state.currentPair?.includes(humanPlayerId ?? '') && !state.buzzedBy && (
                  <button
                    className="ww-buzz-btn"
                    onClick={() => { playDraw(); dispatch(playerBuzz({ playerId: humanPlayerId! })); }}
                  >
                    DRAW!
                  </button>
                )}
                {state.buzzedBy && (
                  <div style={{ fontSize: '1.3rem', color: '#d4a017', fontWeight: 700 }}>
                    {getParticipantName(state.buzzedBy)} drew first!
                  </div>
                )}
                <div className="ww-timer">{Math.ceil(timeRemaining / 1000)}s</div>
              </div>
            )}
          </div>
        )}

        {state.phase === 'answerOpen' && currentQuestion && (
          <div className="ww-duel-container">
            <div className="ww-duel-header">
              <div style={{ fontSize: '1.2rem', color: '#d4a017', fontWeight: 700, marginBottom: '1rem' }}>
                {getParticipantName(state.buzzedBy ?? '')} drew first!
              </div>
              <div className="ww-duel-pair">
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[0] ?? '')}</div>
                <div className="ww-vs">VS</div>
                <div className="ww-duel-name">{getParticipantName(state.currentPair?.[1] ?? '')}</div>
              </div>
            </div>

            <div className="ww-question-box">
              <div className="ww-question-text">{currentQuestion.prompt}</div>
              <div className="ww-answer-grid">
                {currentQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    className="ww-answer-btn"
                    disabled={state.buzzedBy !== humanPlayerId}
                    onClick={() => {
                      if (state.buzzedBy === humanPlayerId) {
                        playSelect();
                        dispatch(playerAnswer({ answerIndex: idx as 0 | 1 | 2 }));
                      }
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <div className="ww-timer">{Math.ceil(timeRemaining / 1000)}s</div>
            </div>
          </div>
        )}

        {state.phase === 'resolution' && (
          <div className="ww-resolution">
            <h2>Showdown Result</h2>
            {state.lastDuelOutcome === 'correct' && (
              <p className="ww-outcome-correct">
                Correct! {getParticipantName(state.lastEliminatedId ?? '')} has been eliminated.
              </p>
            )}
            {state.lastDuelOutcome === 'wrong' && (
              <p className="ww-outcome-wrong">
                Wrong answer! {getParticipantName(state.lastEliminatedId ?? '')} has been eliminated.
              </p>
            )}
            {state.lastDuelOutcome === 'timeout' && (
              <p className="ww-outcome-timeout">
                Time's up! {getParticipantName(state.lastEliminatedId ?? '')} has been eliminated.
              </p>
            )}
            {state.lastDuelOutcome === 'nobuzz' && (
              <p className="ww-outcome-timeout">
                No one drew! {state.currentPair ? 'Both eliminated.' : ''}
              </p>
            )}
            <button
              className="ww-btn"
              style={{ marginTop: '2rem' }}
              onClick={() => { playContinue(); dispatch(advanceResolution()); }}
            >
              Continue
            </button>
          </div>
        )}

        {state.phase === 'chooseElimination' && (
          <div className="ww-chooser">
            <h2>
              {getParticipantName(state.eliminationChooserId ?? '')}, choose who to eliminate:
            </h2>
            <div className="ww-player-list">
              {state.aliveIds
                .filter((id) => id !== state.eliminationChooserId)
                .map((id) => (
                  <button
                    key={id}
                    className="ww-player-btn"
                    onClick={() => { playSelect(); dispatch(playerChooseElimination({ targetId: id })); }}
                    disabled={!isHuman(state.eliminationChooserId ?? '')}
                  >
                    {getParticipantName(id)}
                  </button>
                ))}
            </div>
          </div>
        )}

        {state.phase === 'chooseNextPair' && (
          <div className="ww-chooser">
            <h2>{getParticipantName(state.controllerId ?? '')}, choose the next duel:</h2>
            <div style={{ fontSize: '1rem', marginBottom: '1.5rem', opacity: 0.8 }}>
              Select two players to face off in the next showdown.
            </div>
            <PairSelector
              aliveIds={state.aliveIds}
              controllerId={state.controllerId ?? ''}
              getParticipantName={getParticipantName}
              isHuman={isHuman}
              onSelectPair={(pair) => dispatch(playerChooseNextPair({ pair }))}
              playSelect={playSelect}
            />
          </div>
        )}

        {state.phase === 'randomPairSelection' && (
          <div className="ww-intro">
            <h2>Random Pair Selection...</h2>
          </div>
        )}

        {state.phase === 'gameOver' && (
          <div className="ww-winner">
            <div className="ww-sheriff-badge">⭐</div>
            <h2>Sheriff Champion!</h2>
            <div className="ww-winner-name">{getParticipantName(state.winnerId ?? '')}</div>
            <p style={{ fontSize: '1.2rem', opacity: 0.9 }}>
              The last outlaw standing claims the {prizeType === 'HOH' ? 'Head of Household' : 'Power of Veto'}!
            </p>
            {standalone && (
              <button
                className="ww-btn"
                style={{ marginTop: '2rem' }}
                onClick={() => dispatch(advanceGameOver())}
              >
                Finish
              </button>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="ww-status-bar">
        <div>
          <span className="ww-alive-count">Alive: {state.aliveIds.length}</span>
          {' | '}
          <span className="ww-eliminated">Eliminated: {state.eliminatedIds.length}</span>
        </div>
        <div>Duel #{state.duelNumber}</div>
      </div>
    </div>
  );
}

// Helper component for pair selection
interface PairSelectorProps {
  aliveIds: string[];
  controllerId: string;
  getParticipantName: (id: string) => string;
  isHuman: (id: string) => boolean;
  onSelectPair: (pair: [string, string]) => void;
  playSelect: () => void;
}

function PairSelector({ aliveIds, controllerId, getParticipantName, isHuman, onSelectPair, playSelect }: PairSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const handleToggle = (id: string) => {
    playSelect();
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
    } else if (selected.length < 2) {
      setSelected([...selected, id]);
    }
  };

  const handleConfirm = () => {
    if (selected.length === 2) {
      playSelect();
      onSelectPair([selected[0], selected[1]]);
    }
  };

  const isControllerHuman = isHuman(controllerId);

  return (
    <div>
      <div className="ww-player-list" style={{ marginBottom: '1.5rem' }}>
        {aliveIds.map((id) => (
          <button
            key={id}
            className="ww-player-btn"
            onClick={() => handleToggle(id)}
            disabled={!isControllerHuman}
            style={{
              background: selected.includes(id) ? '#d4a017' : '#722f37',
              borderColor: selected.includes(id) ? '#f4e4c1' : '#8b4513',
            }}
          >
            {getParticipantName(id)} {selected.includes(id) && '✓'}
          </button>
        ))}
      </div>
      {isControllerHuman && (
        <button
          className="ww-btn"
          onClick={handleConfirm}
          disabled={selected.length !== 2}
          style={{ opacity: selected.length === 2 ? 1 : 0.5 }}
        >
          Confirm Duel
        </button>
      )}
    </div>
  );
}
