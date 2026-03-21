/**
 * WildcardWesternComp.tsx – Main React component for Wildcard Western.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
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
/** Spectator auto-advance delay for passive "continue" beats. */
const SPECTATOR_CONTINUE_DELAY_MS = 1500;
/** Spectator auto-advance delay for the "Begin Duel" beat. */
const SPECTATOR_BEGIN_DUEL_DELAY_MS = 1100;
/** Fast skip-to-results delay between simulated steps. */
const SPECTATOR_SKIP_STEP_DELAY_MS = 250;

// ─── WwAvatar ──────────────────────────────────────────────────────────────────
// Compact circular avatar used in avatar-grid selectors and the status bar.

interface WwAvatarProps {
  name: string;
  avatarUrl: string;
  isSelected?: boolean;
  isDuelist?: boolean;
  isEliminated?: boolean;
  isYou?: boolean;
  badge?: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

function WwAvatar({
  name,
  avatarUrl,
  isSelected,
  isDuelist,
  isEliminated,
  isYou,
  badge,
  onClick,
  disabled,
  size = 'md',
}: WwAvatarProps) {
  const [imgSrc, setImgSrc] = useState(avatarUrl);
  // Reset img src when avatarUrl changes (e.g. participant map updated)
  useEffect(() => { setImgSrc(avatarUrl); }, [avatarUrl]);

  function handleImgError() {
    const fallback = getDicebear(name);
    if (imgSrc !== fallback) setImgSrc(fallback);
  }

  const btnClasses = [
    'ww-avatar-btn',
    `ww-avatar-btn--${size}`,
    isSelected ? 'ww-avatar-btn--selected' : '',
    isDuelist && !isSelected ? 'ww-avatar-btn--duelist' : '',
    isEliminated ? 'ww-avatar-btn--eliminated' : '',
  ].filter(Boolean).join(' ');

  const ariaLabel = [
    name,
    isYou ? 'you' : null,
    isSelected ? 'selected' : null,
    isDuelist ? 'current duelist' : null,
    isEliminated ? 'eliminated' : null,
  ].filter(Boolean).join(' – ');

  return (
    <div className={['ww-avatar-item', disabled && !isEliminated ? 'ww-avatar-item--disabled' : ''].filter(Boolean).join(' ')}>
      <button
        className={btnClasses}
        type="button"
        onClick={!disabled && !isEliminated ? onClick : undefined}
        disabled={disabled && !isEliminated}
        aria-label={ariaLabel}
        title={name}
      >
        <div className={['ww-avatar-inner', isEliminated ? 'ww-avatar-inner--eliminated' : ''].filter(Boolean).join(' ')}>
          <img src={imgSrc} alt={name} className="ww-avatar-img" onError={handleImgError} />
        </div>
        {isYou && <span className="ww-avatar-you" aria-label="You">YOU</span>}
        {badge && <span className="ww-avatar-badge" aria-hidden="true">{badge}</span>}
        {isEliminated && <span className="ww-avatar-x" aria-hidden="true">✕</span>}
      </button>
      <span className={`ww-avatar-name${size === 'sm' ? ' ww-avatar-name--sm' : ''}`}>{name}</span>
    </div>
  );
}

// ─── WwAvatarDuelist ────────────────────────────────────────────────────────
// Larger avatar used in duel pair display — not interactive, always duelist-styled.

interface WwAvatarDuelistProps {
  name: string;
  avatarUrl: string;
  isYou?: boolean;
  isBuzzed?: boolean;
}

function WwAvatarDuelist({ name, avatarUrl, isYou, isBuzzed }: WwAvatarDuelistProps) {
  return (
    <div className="ww-duel-avatar">
      <WwAvatar
        name={name}
        avatarUrl={avatarUrl}
        isDuelist={!isBuzzed}
        isSelected={isBuzzed}
        isYou={isYou}
        badge={isBuzzed ? '🎯' : undefined}
        size="lg"
      />
    </div>
  );
}

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
  const humanPlayerId = participants.find((p) => p.isHuman)?.id ?? null;

  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showSpectatorModal, setShowSpectatorModal] = useState(false);
  const [spectatorMode, setSpectatorMode] = useState<'playing' | 'prompt' | 'watching' | 'skipping'>(
    humanPlayerId ? 'playing' : 'watching',
  );

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

  // These helpers intentionally close over participantMap.current (a mutable ref)
  // so they always read the latest participant metadata without recreating callbacks
  // on every render.
  const getParticipantName = useCallback((id: string) => {
    return participantMap.current.get(id)?.name ?? id;
  }, []);

  const getParticipantAvatar = useCallback((id: string): string => {
    const p = participantMap.current.get(id);
    if (!p) return getDicebear(id);
    return resolveAvatar({ id: p.id, name: p.name, avatar: '' });
  }, []);

  const isHuman = useCallback((id: string) => {
    return participantMap.current.get(id)?.isHuman ?? false;
  }, []);

  const buildCompletion = useCallback((): ReactMinigameCompletion | undefined => {
    if (!state.winnerId) return undefined;
    return {
      authoritativeWinnerId: state.winnerId,
    };
  }, [state.winnerId]);
  const isHumanEliminated = humanPlayerId ? state.eliminatedIds.includes(humanPlayerId) : false;
  const isSpectating = spectatorMode === 'watching' || spectatorMode === 'skipping';
  const isSkippingToResults = spectatorMode === 'skipping';
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

  // Human eliminated → prompt for spectator choice once per run.
  useEffect(() => {
    if (!humanPlayerId) return;
    if (!isHumanEliminated) return;
    if (spectatorMode !== 'playing') return;
    if (state.phase === 'gameOver' || state.phase === 'complete') return;
    setSpectatorMode('prompt');
    setShowSpectatorModal(true);
  }, [humanPlayerId, isHumanEliminated, spectatorMode, state.phase]);

  useEffect(() => {
    if (state.phase !== 'gameOver' && state.phase !== 'complete') return;
    setShowSpectatorModal(false);
  }, [state.phase]);

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
  }, [dispatch, isHuman, scheduleTimeout, seed, state.currentPair, state.currentQuestionId, state.duelNumber, state.phase]);

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
  }, [dispatch, isHuman, scheduleTimeout, seed, state.buzzedBy, state.currentQuestionId, state.duelNumber, state.phase]);

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
  }, [dispatch, isHuman, scheduleTimeout, seed, state.aliveIds, state.duelNumber, state.eliminationChooserId, state.phase]);

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
  }, [dispatch, isHuman, scheduleTimeout, seed, state.aliveIds, state.controllerId, state.duelNumber, state.phase]);

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
    }, isSkippingToResults ? SPECTATOR_SKIP_STEP_DELAY_MS : WINNER_DISPLAY_DURATION_MS);
  }, [buildCompletion, isSkippingToResults, scheduleTimeout, shouldNotifyHostedCompletion]);

  // Spectator auto-pacing after the human has been eliminated.
  useEffect(() => {
    if (!isHumanEliminated) return;
    if (spectatorMode !== 'watching' && spectatorMode !== 'skipping') return;

    const fast = spectatorMode === 'skipping';

    if (state.phase === 'resolution') {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'resolution') return;
        playContinue();
        dispatch(advanceResolution());
      }, fast ? SPECTATOR_SKIP_STEP_DELAY_MS : SPECTATOR_CONTINUE_DELAY_MS);
      return;
    }

    if (state.phase === 'pairIntro') {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'pairIntro') return;
        playContinue();
        dispatch(advancePairIntro());
      }, fast ? SPECTATOR_SKIP_STEP_DELAY_MS : SPECTATOR_BEGIN_DUEL_DELAY_MS);
      return;
    }

    if (state.phase === 'finalDuel' && fast) {
      scheduleTimeout(() => {
        if (phaseRef.current === 'finalDuel') {
          dispatch(advancePairIntro());
        }
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'gameOver' && standalone) {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'gameOver') return;
        dispatch(advanceGameOver());
      }, fast ? SPECTATOR_SKIP_STEP_DELAY_MS : WINNER_DISPLAY_DURATION_MS);
      return;
    }

    if (!fast) return;

    if (state.phase === 'duelQuestion') {
      scheduleTimeout(() => {
        if (phaseRef.current === 'duelQuestion') {
          dispatch(openBuzzWindow());
        }
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'randomPairSelection') {
      scheduleTimeout(() => {
        if (phaseRef.current === 'randomPairSelection') {
          dispatch(randomPairChosen());
        }
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'buzzOpen') {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'buzzOpen' || !state.currentPair) return;

        const question = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
        if (!question) {
          dispatch(buzzTimeout());
          return;
        }

        const plannedBuzzes = state.currentPair
          .filter((id) => !isHuman(id))
          .map((playerId) => ({
            playerId,
            plan: precomputeAiDuelPlan(
              playerId,
              getAiPersonality(playerId, seed),
              question,
              seed,
              state.duelNumber,
            ),
          }))
          .filter(({ plan }) => plan.willBuzz)
          .sort((a, b) => a.plan.buzzDelayMs - b.plan.buzzDelayMs);

        if (plannedBuzzes.length > 0) {
          dispatch(playerBuzz({ playerId: plannedBuzzes[0].playerId }));
          return;
        }

        dispatch(buzzTimeout());
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'answerOpen' && state.buzzedBy) {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'answerOpen') return;
        const buzzedBy = state.buzzedBy;
        if (!buzzedBy) {
          dispatch(answerTimeout());
          return;
        }
        if (isHuman(buzzedBy)) {
          dispatch(answerTimeout());
          return;
        }

        const question = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
        if (!question) {
          dispatch(answerTimeout());
          return;
        }

        const plan = precomputeAiDuelPlan(
          buzzedBy,
          getAiPersonality(buzzedBy, seed),
          question,
          seed,
          state.duelNumber,
        );

        if (plan.willAnswer) {
          dispatch(playerAnswer({ answerIndex: plan.chosenAnswerIndex }));
          return;
        }

        dispatch(answerTimeout());
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'chooseElimination' && state.eliminationChooserId) {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'chooseElimination') return;
        const eliminationChooserId = state.eliminationChooserId;
        if (!eliminationChooserId) return;
        const targetId = precomputeAiEliminationChoice(
          eliminationChooserId,
          state.aliveIds,
          seed,
          state.duelNumber,
        );
        dispatch(playerChooseElimination({ targetId }));
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
      return;
    }

    if (state.phase === 'chooseNextPair' && state.controllerId) {
      scheduleTimeout(() => {
        if (phaseRef.current !== 'chooseNextPair') return;
        const controllerId = state.controllerId;
        if (!controllerId) return;
        const pair = precomputeAiNextPair(controllerId, state.aliveIds, seed, state.duelNumber);
        dispatch(playerChooseNextPair({ pair }));
      }, SPECTATOR_SKIP_STEP_DELAY_MS);
    }
  }, [
    dispatch,
    isHumanEliminated,
    isHuman,
    playContinue,
    scheduleTimeout,
    seed,
    spectatorMode,
    standalone,
    state.aliveIds,
    state.buzzedBy,
    state.controllerId,
    state.currentPair,
    state.currentQuestionId,
    state.duelNumber,
    state.eliminationChooserId,
    state.phase,
  ]);

  // Render
  const currentQuestion = WILDCARD_QUESTIONS.find((q) => q.id === state.currentQuestionId);
  const selectedAnswerText =
    currentQuestion && state.selectedAnswerIndex !== null
      ? currentQuestion.options[state.selectedAnswerIndex]
      : null;
  const correctAnswerText = currentQuestion ? currentQuestion.options[currentQuestion.correctIndex] : null;

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
                    <div className="ww-player-card-avatar">
                      <WwAvatar
                        name={getParticipantName(id)}
                        avatarUrl={getParticipantAvatar(id)}
                        isEliminated={!isAlive}
                        isYou={isHuman(id)}
                        size="md"
                      />
                    </div>
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
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[0] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[0] ?? '')}
                  isYou={isHuman(state.currentPair?.[0] ?? '')}
                />
                <div className="ww-vs">VS</div>
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[1] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[1] ?? '')}
                  isYou={isHuman(state.currentPair?.[1] ?? '')}
                />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              {isSpectating ? (
                <div className="ww-spectator-note" aria-live="polite">
                  Spectator mode: the next showdown begins automatically.
                </div>
              ) : (
                <button className="ww-btn" onClick={() => { playSelect(); dispatch(advancePairIntro()); }}>
                  Begin Duel
                </button>
              )}
            </div>
          </div>
        )}

        {state.phase === 'finalDuel' && (
          <div className="ww-duel-container">
            <div className="ww-duel-header">
              <div className="ww-duel-title">Final Duel</div>
              <div className="ww-duel-pair">
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[0] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[0] ?? '')}
                  isYou={isHuman(state.currentPair?.[0] ?? '')}
                />
                <div className="ww-vs">VS</div>
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[1] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[1] ?? '')}
                  isYou={isHuman(state.currentPair?.[1] ?? '')}
                />
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
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[0] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[0] ?? '')}
                  isYou={isHuman(state.currentPair?.[0] ?? '')}
                  isBuzzed={state.buzzedBy === state.currentPair?.[0]}
                />
                <div className="ww-vs">VS</div>
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[1] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[1] ?? '')}
                  isYou={isHuman(state.currentPair?.[1] ?? '')}
                  isBuzzed={state.buzzedBy === state.currentPair?.[1]}
                />
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
                  <div className="ww-draw-callout" aria-live="assertive">
                    <span className="ww-draw-callout__icon" aria-hidden="true">⚡</span>
                    <div>
                      <div className="ww-draw-callout__label">Quickest draw</div>
                      <div className="ww-draw-callout__name">{getParticipantName(state.buzzedBy)} drew first!</div>
                    </div>
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
              <div className="ww-draw-callout ww-draw-callout--compact" aria-live="polite">
                <span className="ww-draw-callout__icon" aria-hidden="true">⚡</span>
                <div>
                  <div className="ww-draw-callout__label">First draw</div>
                  <div className="ww-draw-callout__name">{getParticipantName(state.buzzedBy ?? '')} answers now</div>
                </div>
              </div>
              <div className="ww-duel-pair">
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[0] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[0] ?? '')}
                  isYou={isHuman(state.currentPair?.[0] ?? '')}
                  isBuzzed={state.buzzedBy === state.currentPair?.[0]}
                />
                <div className="ww-vs">VS</div>
                <WwAvatarDuelist
                  name={getParticipantName(state.currentPair?.[1] ?? '')}
                  avatarUrl={getParticipantAvatar(state.currentPair?.[1] ?? '')}
                  isYou={isHuman(state.currentPair?.[1] ?? '')}
                  isBuzzed={state.buzzedBy === state.currentPair?.[1]}
                />
              </div>
            </div>

            <div className="ww-question-box">
              <div className="ww-question-text">{currentQuestion.prompt}</div>
              <div className="ww-answer-subtitle">
                {state.buzzedBy === humanPlayerId
                  ? 'Pick your answer before the timer hits zero.'
                  : `${getParticipantName(state.buzzedBy ?? '')} is locking in an answer…`}
              </div>
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
            {state.buzzedBy && (
              <div className="ww-draw-callout ww-draw-callout--compact" aria-live="polite">
                <span className="ww-draw-callout__icon" aria-hidden="true">⚡</span>
                <div>
                  <div className="ww-draw-callout__label">Draw winner</div>
                  <div className="ww-draw-callout__name">{getParticipantName(state.buzzedBy)} fired first</div>
                </div>
              </div>
            )}
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
            {(selectedAnswerText || correctAnswerText) && state.lastDuelOutcome !== 'nobuzz' && (
              <div className="ww-answer-reveal">
                {selectedAnswerText && (
                  <div className="ww-answer-reveal-card">
                    <div className="ww-answer-reveal-label">Chosen answer</div>
                    <div className="ww-answer-reveal-value">{selectedAnswerText}</div>
                  </div>
                )}
                {correctAnswerText && (
                  <div className="ww-answer-reveal-card ww-answer-reveal-card--correct">
                    <div className="ww-answer-reveal-label">Correct answer</div>
                    <div className="ww-answer-reveal-value">{correctAnswerText}</div>
                  </div>
                )}
              </div>
            )}
            {isSpectating ? (
              <div className="ww-spectator-note" aria-live="polite">
                Spectator mode: continuing automatically.
              </div>
            ) : (
              <button
                className="ww-btn"
                style={{ marginTop: '2rem' }}
                onClick={() => { playContinue(); dispatch(advanceResolution()); }}
              >
                Continue
              </button>
            )}
          </div>
        )}

        {state.phase === 'chooseElimination' && (
          <div className="ww-chooser">
            <h2>
              {getParticipantName(state.eliminationChooserId ?? '')}, choose who to eliminate:
            </h2>
            <div className="ww-avatar-grid">
              {state.aliveIds
                .filter((id) => id !== state.eliminationChooserId)
                .map((id) => (
                  <WwAvatar
                    key={id}
                    name={getParticipantName(id)}
                    avatarUrl={getParticipantAvatar(id)}
                    isYou={isHuman(id)}
                    onClick={() => { playSelect(); dispatch(playerChooseElimination({ targetId: id })); }}
                    disabled={!isHuman(state.eliminationChooserId ?? '')}
                    size="md"
                  />
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
              getParticipantAvatar={getParticipantAvatar}
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
            {standalone && !isSpectating && (
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

      {showSpectatorModal && (
        <div className="ww-spectator-overlay" role="presentation">
          <div className="ww-spectator-card" role="dialog" aria-modal="true" aria-label="Spectator options">
            <div className="ww-spectator-icon" aria-hidden="true">🤠</div>
            <h2>You have been eliminated.</h2>
            <p>Watch the rest of the Wildcard Western play out, or jump straight to the final result.</p>
            <div className="ww-spectator-actions">
              <button
                className="ww-btn"
                type="button"
                onClick={() => {
                  setShowSpectatorModal(false);
                  setSpectatorMode('watching');
                }}
              >
                Continue Watching
              </button>
              <button
                className="ww-btn ww-btn--secondary"
                type="button"
                onClick={() => {
                  setShowSpectatorModal(false);
                  setSpectatorMode('skipping');
                }}
              >
                Skip to Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="ww-status-bar">
        <div className="ww-status-bar-counts">
          <span className="ww-alive-count">Alive: {state.aliveIds.length}</span>
          <span>Duel #{state.duelNumber}</span>
          <span className="ww-eliminated">Out: {state.eliminatedIds.length}</span>
        </div>
        <div className="ww-status-avatars">
          {state.aliveIds.map((id) => (
            <WwAvatar
              key={id}
              name={getParticipantName(id)}
              avatarUrl={getParticipantAvatar(id)}
              isYou={isHuman(id)}
              isDuelist={state.currentPair?.includes(id)}
              size="sm"
            />
          ))}
          {state.eliminatedIds.map((id) => (
            <WwAvatar
              key={id}
              name={getParticipantName(id)}
              avatarUrl={getParticipantAvatar(id)}
              isEliminated
              size="sm"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper component for pair selection
interface PairSelectorProps {
  aliveIds: string[];
  controllerId: string;
  getParticipantName: (id: string) => string;
  getParticipantAvatar: (id: string) => string;
  isHuman: (id: string) => boolean;
  onSelectPair: (pair: [string, string]) => void;
  playSelect: () => void;
}

function PairSelector({ aliveIds, controllerId, getParticipantName, getParticipantAvatar, isHuman, onSelectPair, playSelect }: PairSelectorProps) {
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
      <div className="ww-avatar-grid" style={{ marginBottom: '1.5rem' }}>
        {aliveIds.map((id) => (
          <WwAvatar
            key={id}
            name={getParticipantName(id)}
            avatarUrl={getParticipantAvatar(id)}
            isSelected={selected.includes(id)}
            isYou={isHuman(id)}
            badge={selected.includes(id) ? '✓' : undefined}
            onClick={() => handleToggle(id)}
            disabled={!isControllerHuman}
            size="md"
          />
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
