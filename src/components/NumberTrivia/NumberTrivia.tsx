import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededPickN, mulberry32 } from '../../store/rng';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { NUMBER_TRIVIA_QUESTIONS } from './numberTriviaData';
import {
  compareTriviaStandings,
  computeNumberTriviaRoundScore,
  createNumberTriviaAiRng,
  getNumberTriviaDuelLoserId,
  getNumberTriviaEliminationCount,
  getNumberTriviaFinalistIds,
  getTriviaHint,
  NUMBER_TRIVIA_DUEL_STARTING_LIVES,
  NUMBER_TRIVIA_MAX_ATTEMPTS,
  NUMBER_TRIVIA_READING_BUFFER_MS,
  NUMBER_TRIVIA_TOTAL_ROUNDS,
  simulateNumberTriviaAiPerformance,
  type TriviaRoundPerformance,
  type TriviaStanding,
} from './numberTriviaUtils';
import './NumberTrivia.css';

interface ScoreboardState {
  phase: 'qualifier' | 'duel';
  roundNumber: number;
  duelNumber?: number;
  answer: number;
  eliminatedIds: string[];
  lifeLostId?: string;
  finalistIds: string[];
  lives: Record<string, number>;
  standings: TriviaStanding[];
  final: boolean;
}

interface ResolvedParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  precomputedScore: number;
}

function buildFallbackParticipants(): ResolvedParticipant[] {
  return [
    { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
    { id: 'ai-1', name: 'Cipher', isHuman: false, precomputedScore: 52 },
    { id: 'ai-2', name: 'Nova', isHuman: false, precomputedScore: 64 },
    { id: 'ai-3', name: 'Atlas', isHuman: false, precomputedScore: 76 },
  ];
}

function makeInitialStandings(participants: ResolvedParticipant[]): TriviaStanding[] {
  return participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    isHuman: participant.isHuman,
    cumulativeScore: 0,
    lastRoundScore: 0,
    lastRoundAttempts: 0,
    lastRoundTimeMs: 0,
    lastRoundGuessed: false,
    eliminatedRound: null,
  }));
}

export default function NumberTrivia({
  onFinish,
  participantIds,
  participants,
  seed = 0,
}: GenericMinigameProps) {
  const resolvedParticipants = useMemo<ResolvedParticipant[]>(() => {
    if (participants && participants.length > 0) {
      return participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        isHuman: participant.isHuman,
        precomputedScore: participant.precomputedScore,
      }));
    }
    if (participantIds && participantIds.length > 0) {
      return participantIds.map((id, index) => ({
        id,
        name: index === 0 ? 'You' : `Player ${index + 1}`,
        isHuman: index === 0,
        precomputedScore: 45 + index * 10,
      }));
    }
    return buildFallbackParticipants();
  }, [participantIds, participants]);

  const chosenQuestions = useMemo(() => {
    const rng = mulberry32(seed >>> 0);
    // The first five picks remain the qualifier questions. The rest provide a
    // deterministic, non-repeating bank for a duel of any realistic length.
    return seededPickN(rng, NUMBER_TRIVIA_QUESTIONS, NUMBER_TRIVIA_QUESTIONS.length);
  }, [seed]);

  const humanId = useMemo(
    () => resolvedParticipants.find((participant) => participant.isHuman)?.id ?? resolvedParticipants[0]?.id ?? 'human',
    [resolvedParticipants],
  );

  const [standings, setStandings] = useState<TriviaStanding[]>(() => makeInitialStandings(resolvedParticipants));
  const [roundIndex, setRoundIndex] = useState(0);
  const [phase, setPhase] = useState<'qualifier' | 'duel'>('qualifier');
  const [duelIndex, setDuelIndex] = useState(0);
  const [duelLives, setDuelLives] = useState<Record<string, number>>({});
  const [answerInput, setAnswerInput] = useState('');
  const [hint, setHint] = useState('Read the question — answering opens shortly');
  const [roundAttempts, setRoundAttempts] = useState(0);
  const [closestDistance, setClosestDistance] = useState<number | undefined>(undefined);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [readingSeconds, setReadingSeconds] = useState(Math.ceil(NUMBER_TRIVIA_READING_BUFFER_MS / 1000));
  const [answeringOpen, setAnsweringOpen] = useState(false);
  const roundStartedAtRef = useRef(0);

  const currentRoundNumber = roundIndex + 1;
  const currentQuestion = phase === 'duel'
    ? chosenQuestions[NUMBER_TRIVIA_TOTAL_ROUNDS + duelIndex]
    : chosenQuestions[roundIndex];
  const activeStandings = useMemo(
    () => standings.filter((entry) => (
      phase === 'duel'
        ? (duelLives[entry.participantId] ?? 0) > 0
        : entry.eliminatedRound === null
    )),
    [duelLives, phase, standings],
  );
  const humanStanding = standings.find((entry) => entry.participantId === humanId) ?? null;
  const humanStillActive = phase === 'duel'
    ? (duelLives[humanId] ?? 0) > 0
    : humanStanding?.eliminatedRound === null;

  useEffect(() => {
    if (scoreboard || !currentQuestion || !humanStillActive) {
      return undefined;
    }

    const readingStartedAt = Date.now();
    const tick = window.setInterval(() => {
      const remainingMs = Math.max(0, NUMBER_TRIVIA_READING_BUFFER_MS - (Date.now() - readingStartedAt));
      setReadingSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
    }, 200);
    const open = window.setTimeout(() => {
      window.clearInterval(tick);
      roundStartedAtRef.current = Date.now();
      setReadingSeconds(0);
      setAnsweringOpen(true);
      setHint('Enter your answer below');
    }, NUMBER_TRIVIA_READING_BUFFER_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(open);
    };
  }, [currentQuestion, humanStillActive, scoreboard]);

  const finishCompetition = useCallback((finalStandings: TriviaStanding[]) => {
    if (!onFinish || finalStandings.length === 0) return;
    const rawResults = Object.fromEntries(finalStandings.map((entry) => [entry.participantId, entry.cumulativeScore]));
    const winner = finalStandings[0];
    onFinish(rawResults[humanId] ?? winner.cumulativeScore, undefined, {
      authoritativeWinnerId: winner.participantId,
      rawValue: rawResults[humanId] ?? winner.cumulativeScore,
      rawResults,
    });
  }, [humanId, onFinish]);

  const resolveRound = useCallback((
    humanPerformance?: TriviaRoundPerformance,
    options?: {
      roundIndex?: number;
      sourceStandings?: TriviaStanding[];
    },
  ) => {
    const effectiveRoundIndex = options?.roundIndex ?? roundIndex;
    const effectiveRoundNumber = effectiveRoundIndex + 1;
    const effectiveQuestion = chosenQuestions[effectiveRoundIndex];
    const sourceStandings = options?.sourceStandings ?? standings;
    if (!effectiveQuestion) return null;

    const activeIds = new Set(
      sourceStandings
        .filter((entry) => entry.eliminatedRound === null)
        .map((entry) => entry.participantId),
    );
    const performanceById = new Map<string, TriviaRoundPerformance>();

    sourceStandings.forEach((entry) => {
      if (!activeIds.has(entry.participantId)) return;
      if (entry.participantId === humanId) {
        if (humanPerformance) performanceById.set(entry.participantId, humanPerformance);
        return;
      }
      const participant = resolvedParticipants.find((candidate) => candidate.id === entry.participantId);
      performanceById.set(
        entry.participantId,
        simulateNumberTriviaAiPerformance(
          {
            precomputedScore: participant?.precomputedScore ?? 50,
            roundNumber: effectiveRoundNumber,
            question: effectiveQuestion,
          },
          createNumberTriviaAiRng({
            seed,
            roundNumber: effectiveRoundNumber,
            participantId: entry.participantId,
          }),
        ),
      );
    });

    const updated = sourceStandings.map((entry) => {
      const performance = performanceById.get(entry.participantId);
      if (!performance) return entry;
      const roundScore = computeNumberTriviaRoundScore(performance);
      return {
        ...entry,
        cumulativeScore: entry.cumulativeScore + roundScore,
        lastRoundScore: roundScore,
        lastRoundAttempts: performance.attempts,
        lastRoundTimeMs: performance.timeMs,
        lastRoundGuessed: performance.guessed,
      };
    });

    const rankedActive = updated
      .filter((entry) => entry.eliminatedRound === null)
      .sort(compareTriviaStandings);
    const isFinalQualifier = effectiveRoundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS;
    const finalistIds = isFinalQualifier
      ? getNumberTriviaFinalistIds(rankedActive)
      : [];
    const eliminationCount = getNumberTriviaEliminationCount(effectiveRoundNumber, rankedActive.length);
    const eliminatedIds = isFinalQualifier
      ? rankedActive
        .filter((entry) => !finalistIds.includes(entry.participantId))
        .map((entry) => entry.participantId)
      : rankedActive
        .slice(Math.max(0, rankedActive.length - eliminationCount))
        .map((entry) => entry.participantId);

    const nextStandings = updated
      .map((entry) => (
        eliminatedIds.includes(entry.participantId) && entry.eliminatedRound === null
          ? { ...entry, eliminatedRound: effectiveRoundNumber }
          : entry
      ))
      .sort(compareTriviaStandings);

    const remainingIds = nextStandings
      .filter((entry) => entry.eliminatedRound === null)
      .map((entry) => entry.participantId);
    const resolvedFinalistIds = isFinalQualifier ? finalistIds : remainingIds;
    const lives = isFinalQualifier
      ? Object.fromEntries(resolvedFinalistIds.map((id) => [id, NUMBER_TRIVIA_DUEL_STARTING_LIVES]))
      : {};
    const final = isFinalQualifier && resolvedFinalistIds.length <= 1;

    setStandings(nextStandings);
    setRoundIndex(effectiveRoundIndex);
    if (isFinalQualifier) setDuelLives(lives);
    const nextScoreboard: ScoreboardState = {
      phase: 'qualifier',
      roundNumber: effectiveRoundNumber,
      answer: effectiveQuestion.answer,
      eliminatedIds,
      finalistIds: resolvedFinalistIds,
      lives,
      standings: nextStandings,
      final,
    };
    setScoreboard(nextScoreboard);
    return nextScoreboard;
  }, [
    chosenQuestions,
    humanId,
    standings,
    resolvedParticipants,
    roundIndex,
    seed,
  ]);

  const resolveDuel = useCallback((
    humanPerformance?: TriviaRoundPerformance,
    options?: {
      duelIndex?: number;
      sourceStandings?: TriviaStanding[];
      sourceLives?: Record<string, number>;
    },
  ) => {
    const effectiveDuelIndex = options?.duelIndex ?? duelIndex;
    const duelNumber = effectiveDuelIndex + 1;
    const effectiveQuestion = chosenQuestions[NUMBER_TRIVIA_TOTAL_ROUNDS + effectiveDuelIndex];
    const sourceStandings = options?.sourceStandings ?? standings;
    const sourceLives = options?.sourceLives ?? duelLives;
    if (!effectiveQuestion) return null;

    const activeIds = sourceStandings
      .filter((entry) => (sourceLives[entry.participantId] ?? 0) > 0)
      .map((entry) => entry.participantId);
    if (activeIds.length <= 1) return null;

    const performanceById = new Map<string, TriviaRoundPerformance>();
    activeIds.forEach((participantId) => {
      if (participantId === humanId) {
        if (humanPerformance) performanceById.set(participantId, humanPerformance);
        return;
      }
      const participant = resolvedParticipants.find((candidate) => candidate.id === participantId);
      performanceById.set(
        participantId,
        simulateNumberTriviaAiPerformance(
          {
            precomputedScore: participant?.precomputedScore ?? 50,
            roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
            question: effectiveQuestion,
          },
          createNumberTriviaAiRng({
            seed,
            roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
            participantId,
          }),
        ),
      );
    });

    const duelEntries = activeIds.flatMap((participantId) => {
      const performance = performanceById.get(participantId);
      return performance ? [{ participantId, performance }] : [];
    });
    const lifeLostId = getNumberTriviaDuelLoserId(
      duelEntries,
      createNumberTriviaAiRng({
        seed,
        roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
        participantId: 'duel-tiebreak',
      }),
    );
    if (!lifeLostId) return null;

    const nextLives = {
      ...sourceLives,
      [lifeLostId]: Math.max(0, (sourceLives[lifeLostId] ?? NUMBER_TRIVIA_DUEL_STARTING_LIVES) - 1),
    };
    const eliminatedIds = nextLives[lifeLostId] === 0 ? [lifeLostId] : [];
    const updated = sourceStandings.map((entry) => {
      const performance = performanceById.get(entry.participantId);
      const scored = performance
        ? {
          ...entry,
          cumulativeScore: entry.cumulativeScore + computeNumberTriviaRoundScore(performance),
          lastRoundScore: computeNumberTriviaRoundScore(performance),
          lastRoundAttempts: performance.attempts,
          lastRoundTimeMs: performance.timeMs,
          lastRoundGuessed: performance.guessed,
        }
        : entry;
      return eliminatedIds.includes(entry.participantId)
        ? { ...scored, eliminatedRound: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber }
        : scored;
    });
    const remainingIds = activeIds.filter((id) => (nextLives[id] ?? 0) > 0);
    const final = remainingIds.length <= 1;
    const nextStandings = [...updated].sort((a, b) => {
      const livesDifference = (nextLives[b.participantId] ?? -1) - (nextLives[a.participantId] ?? -1);
      if (livesDifference !== 0) return livesDifference;
      return compareTriviaStandings(a, b);
    });

    setStandings(nextStandings);
    setDuelLives(nextLives);
    setDuelIndex(effectiveDuelIndex);
    const nextScoreboard: ScoreboardState = {
      phase: 'duel',
      roundNumber: NUMBER_TRIVIA_TOTAL_ROUNDS + duelNumber,
      duelNumber,
      answer: effectiveQuestion.answer,
      eliminatedIds,
      lifeLostId,
      finalistIds: Object.keys(nextLives),
      lives: nextLives,
      standings: nextStandings,
      final,
    };
    setScoreboard(nextScoreboard);
    return nextScoreboard;
  }, [
    chosenQuestions,
    duelIndex,
    duelLives,
    humanId,
    resolvedParticipants,
    seed,
    standings,
  ]);

  const submitAnswer = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard || !answeringOpen) return;
    const trimmedAnswerInput = answerInput.trim();
    const guess = Number(trimmedAnswerInput);
    if (trimmedAnswerInput === '' || !Number.isInteger(guess)) {
      setInputError('Please enter a whole number.');
      return;
    }

    setInputError(null);
    const nextAttempts = roundAttempts + 1;
    const distance = Math.abs(guess - currentQuestion.answer);
    const bestDistance = Math.min(distance, closestDistance ?? Number.POSITIVE_INFINITY);
    setRoundAttempts(nextAttempts);
    setClosestDistance(bestDistance);

    if (guess === currentQuestion.answer) {
      setHint('✓ Correct!');
      const performance = {
        guessed: true,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: 0,
      };
      if (phase === 'duel') resolveDuel(performance);
      else resolveRound(performance);
      return;
    }

    if (nextAttempts >= NUMBER_TRIVIA_MAX_ATTEMPTS) {
      setHint(`Out of attempts — the answer was ${currentQuestion.answer}.`);
      const performance = {
        guessed: false,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: bestDistance,
      };
      if (phase === 'duel') resolveDuel(performance);
      else resolveRound(performance);
      return;
    }

    setHint(getTriviaHint(guess, currentQuestion.answer));
    setAnswerInput('');
  }, [
    answerInput,
    answeringOpen,
    closestDistance,
    currentQuestion,
    humanStillActive,
    phase,
    resolveDuel,
    resolveRound,
    roundAttempts,
    scoreboard,
  ]);

  const skipQuestion = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard || !answeringOpen) return;
    const performance = {
      guessed: false,
      attempts: Math.max(1, roundAttempts),
      timeMs: Date.now() - roundStartedAtRef.current,
      closestDistance,
      skipped: true,
    };
    if (phase === 'duel') resolveDuel(performance);
    else resolveRound(performance);
  }, [
    answeringOpen,
    closestDistance,
    currentQuestion,
    humanStillActive,
    phase,
    resolveDuel,
    resolveRound,
    roundAttempts,
    scoreboard,
  ]);

  const continueFromScoreboard = useCallback(() => {
    if (!scoreboard) return;
    if (scoreboard.final) {
      finishCompetition(scoreboard.standings);
      return;
    }
    setAnswerInput('');
    setRoundAttempts(0);
    setClosestDistance(undefined);
    setInputError(null);
    setAnsweringOpen(false);
    setReadingSeconds(Math.ceil(NUMBER_TRIVIA_READING_BUFFER_MS / 1000));
    setHint('Read the question — answering opens shortly');

    if (scoreboard.phase === 'qualifier' && scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS) {
      setPhase('duel');
      setDuelIndex(0);
      setDuelLives(scoreboard.lives);
      if ((scoreboard.lives[humanId] ?? 0) > 0) {
        setScoreboard(null);
      } else {
        setHint('You have been eliminated. The finalists will finish the duel.');
        resolveDuel(undefined, {
          duelIndex: 0,
          sourceStandings: scoreboard.standings,
          sourceLives: scoreboard.lives,
        });
      }
      return;
    }

    if (scoreboard.phase === 'duel') {
      const nextDuelIndex = (scoreboard.duelNumber ?? 1);
      setDuelIndex(nextDuelIndex);
      if ((scoreboard.lives[humanId] ?? 0) > 0) {
        setScoreboard(null);
      } else {
        setHint('You are out of lives. The remaining finalists continue.');
        resolveDuel(undefined, {
          duelIndex: nextDuelIndex,
          sourceStandings: scoreboard.standings,
          sourceLives: scoreboard.lives,
        });
      }
      return;
    }

    const nextRoundIndex = roundIndex + 1;
    const nextHumanStanding = standings.find((entry) => entry.participantId === humanId) ?? null;
    if (nextHumanStanding?.eliminatedRound === null) {
      setRoundIndex(nextRoundIndex);
      setScoreboard(null);
    } else {
      setHint('You have been eliminated. The remaining players will finish the tournament.');
      resolveRound(undefined, {
        roundIndex: nextRoundIndex,
        sourceStandings: standings,
      });
    }
  }, [finishCompetition, humanId, resolveDuel, resolveRound, roundIndex, scoreboard, standings]);

  const fastForwardToResults = useCallback(() => {
    if (!scoreboard) return;
    let simulatedStandings = scoreboard.standings;
    let finalScoreboard = scoreboard;
    if (scoreboard.phase === 'qualifier') {
      for (let nextRoundIndex = scoreboard.roundNumber; nextRoundIndex < NUMBER_TRIVIA_TOTAL_ROUNDS; nextRoundIndex += 1) {
        const simulatedRound = resolveRound(undefined, {
          roundIndex: nextRoundIndex,
          sourceStandings: simulatedStandings,
        });
        if (!simulatedRound) break;
        simulatedStandings = simulatedRound.standings;
        finalScoreboard = simulatedRound;
      }
    }

    let simulatedLives = finalScoreboard.lives;
    let nextDuelIndex = finalScoreboard.phase === 'duel' ? (finalScoreboard.duelNumber ?? 1) : 0;
    const duelSafetyLimit = Math.max(6, resolvedParticipants.length * NUMBER_TRIVIA_DUEL_STARTING_LIVES + 2);
    for (let step = 0; step < duelSafetyLimit && !finalScoreboard.final; step += 1) {
      const simulatedDuel = resolveDuel(undefined, {
        duelIndex: nextDuelIndex,
        sourceStandings: simulatedStandings,
        sourceLives: simulatedLives,
      });
      if (!simulatedDuel) break;
      simulatedStandings = simulatedDuel.standings;
      simulatedLives = simulatedDuel.lives;
      finalScoreboard = simulatedDuel;
      nextDuelIndex += 1;
    }

    setStandings(finalScoreboard.standings);
    setDuelLives(finalScoreboard.lives);
    setPhase(finalScoreboard.phase);
    if (finalScoreboard.phase === 'duel') setDuelIndex((finalScoreboard.duelNumber ?? 1) - 1);
    else setRoundIndex(finalScoreboard.roundNumber - 1);
    setScoreboard(finalScoreboard);
  }, [resolveDuel, resolveRound, resolvedParticipants.length, scoreboard]);

  const winner = scoreboard?.standings[0] ?? standings.slice().sort(compareTriviaStandings)[0] ?? null;
  const rootClassName = scoreboard ? 'number-trivia number-trivia--scoreboard' : 'number-trivia number-trivia--playing';

  return (
    <div className={rootClassName} data-testid="number-trivia-root">
      <div className="number-trivia__shell">
        {!scoreboard && currentQuestion && (
          <section className="number-trivia__round" aria-live="polite">
            <header className="number-trivia__header number-trivia__header--playing">
              <p className="number-trivia__eyebrow">
                {phase === 'duel'
                  ? `Three-life final · Duel ${duelIndex + 1}`
                  : `Round ${Math.min(currentRoundNumber, NUMBER_TRIVIA_TOTAL_ROUNDS)} of ${NUMBER_TRIVIA_TOTAL_ROUNDS}`}
              </p>
              <h2 className="number-trivia__title">Number Trivia</h2>
              <p className="number-trivia__subtitle number-trivia__subtitle--compact">
                {phase === 'duel'
                  ? 'The weakest answer loses one life. Last finalist standing wins.'
                  : 'Question and answer stay together on one gameplay screen.'}
              </p>
            </header>

            <section className="number-trivia__summary number-trivia__summary--playing" aria-label="Tournament summary">
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">{phase === 'duel' ? 'Finalists left' : 'Players left'}</span>
                <strong>{activeStandings.length}</strong>
              </div>
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">{phase === 'duel' ? 'Your lives' : 'Your total'}</span>
                <strong>{phase === 'duel' ? (duelLives[humanId] ?? 0) : (humanStanding?.cumulativeScore ?? 0)}</strong>
              </div>
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">Attempts used</span>
                <strong>{roundAttempts}</strong>
              </div>
            </section>

            <div className="number-trivia__question-card number-trivia__gameplay-card" aria-label="Gameplay panel">
              <p className="number-trivia__question-label">Question</p>
              <p className="number-trivia__question-text">{currentQuestion.prompt}</p>

              {humanStillActive && !answeringOpen && (
                <div className="number-trivia__reading-buffer" role="status" aria-label="Reading time">
                  <span>Read first</span>
                  <strong>{readingSeconds}s</strong>
                  <span>Answering is locked for everyone</span>
                </div>
              )}

              <div className="number-trivia__status-card number-trivia__status-card--embedded">
                <p className="number-trivia__status-text">{hint}</p>
                <p className="number-trivia__status-meta">
                  {humanStillActive
                    ? answeringOpen
                      ? `${NUMBER_TRIVIA_MAX_ATTEMPTS - roundAttempts} attempts remaining · response clock running`
                      : 'Shared reading buffer · response clock paused'
                    : 'Spectator mode — remaining players are being simulated.'}
                </p>
              </div>

              {humanStillActive ? (
                <>
                <label className="number-trivia__input-label" htmlFor="number-trivia-answer">
                  Enter your answer
                </label>
                <div className="number-trivia__controls">
                  <input
                    id="number-trivia-answer"
                    className="number-trivia__input"
                    inputMode="numeric"
                    pattern="[0-9-]*"
                    type="number"
                    value={answerInput}
                    disabled={!answeringOpen}
                    onChange={(event) => setAnswerInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitAnswer();
                    }}
                    aria-label="Answer input"
                  />
                  <button className="number-trivia__button number-trivia__button--primary" type="button" onClick={submitAnswer} disabled={!answeringOpen}>
                    Submit
                  </button>
                  <button className="number-trivia__button number-trivia__button--secondary" type="button" onClick={skipQuestion} disabled={!answeringOpen}>
                    Skip
                  </button>
                </div>
                {inputError && <p className="number-trivia__error">{inputError}</p>}
                </>
              ) : (
                <div className="number-trivia__spectator-card">
                  <p>You were eliminated in round {humanStanding?.eliminatedRound}. Watch the rest of the field finish the tournament.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {scoreboard && (
          <section
            className="number-trivia__scoreboard"
            aria-label={scoreboard.final
              ? 'Final scoreboard'
              : scoreboard.phase === 'duel'
                ? `Duel ${scoreboard.duelNumber} scoreboard`
                : `Round ${scoreboard.roundNumber} scoreboard`}
          >
            <header className="number-trivia__header number-trivia__header--scoreboard">
              <p className="number-trivia__eyebrow">
                {scoreboard.final
                  ? 'Final results'
                  : scoreboard.phase === 'duel'
                    ? `Final duel ${scoreboard.duelNumber} complete`
                    : `Round ${scoreboard.roundNumber} complete`}
              </p>
              <h2 className="number-trivia__title">Standings</h2>
              <p className="number-trivia__subtitle">
                {scoreboard.final
                  ? 'The tournament is over.'
                  : scoreboard.phase === 'duel'
                    ? 'One finalist has lost a life. Continue to the next duel question.'
                    : scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
                      ? 'The highest two scores—and ties at the cutoff—advance to the final.'
                      : 'This is the between-round results screen. Continue when you are ready for the next question.'}
              </p>
            </header>

            <div className="number-trivia__question-card number-trivia__question-card--compact">
              <p className="number-trivia__question-label">
                {scoreboard.final
                  ? 'Final scoreboard'
                  : scoreboard.phase === 'duel'
                    ? `Duel ${scoreboard.duelNumber} scoreboard`
                    : `Round ${scoreboard.roundNumber} scoreboard`}
              </p>
              <p className="number-trivia__question-text">Correct answer: {scoreboard.answer}</p>
              {scoreboard.phase === 'duel' && scoreboard.lifeLostId ? (
                <p className="number-trivia__scoreboard-callout">
                  {scoreboard.standings.find((entry) => entry.participantId === scoreboard.lifeLostId)?.participantName ?? scoreboard.lifeLostId}
                  {' '}loses one life — {scoreboard.lives[scoreboard.lifeLostId] ?? 0} remaining.
                </p>
              ) : scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS ? (
                <p className="number-trivia__scoreboard-callout">
                  Finalists:{' '}
                  {scoreboard.finalistIds
                    .map((id) => scoreboard.standings.find((entry) => entry.participantId === id)?.participantName ?? id)
                    .join(', ')}
                </p>
              ) : scoreboard.eliminatedIds.length > 0 ? (
                <p className="number-trivia__scoreboard-callout">
                  Eliminated this round:{' '}
                  {scoreboard.eliminatedIds
                    .map((id) => scoreboard.standings.find((entry) => entry.participantId === id)?.participantName ?? id)
                    .join(', ')}
                </p>
              ) : (
                <p className="number-trivia__scoreboard-callout">No eliminations this round.</p>
              )}
            </div>

            <div className="number-trivia__table-wrap">
              <table className="number-trivia__table">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scoreboard.standings.map((entry, index) => {
                    const isEliminated = entry.eliminatedRound !== null && entry.eliminatedRound <= scoreboard.roundNumber;
                    return (
                      <tr
                        key={entry.participantId}
                        className={[
                          entry.isHuman ? 'number-trivia__row--human' : '',
                          isEliminated ? 'number-trivia__row--eliminated' : '',
                          index === 0 ? 'number-trivia__row--leader' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className="number-trivia__player-cell">
                          <span className="number-trivia__rank">#{index + 1}</span>
                          {entry.participantName}
                          {entry.isHuman ? ' (You)' : ''}
                        </td>
                        <td>{entry.cumulativeScore}</td>
                        <td>
                          {scoreboard.phase === 'duel'
                            ? scoreboard.final && index === 0
                              ? 'Winner'
                              : (scoreboard.lives[entry.participantId] ?? 0) <= 0
                                ? 'Out of lives'
                                : `${'♥'.repeat(scoreboard.lives[entry.participantId] ?? 0)} ${scoreboard.lives[entry.participantId] ?? 0} left`
                            : isEliminated
                              ? `Eliminated R${entry.eliminatedRound}`
                              : scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
                                ? 'Finalist'
                                : 'Advances'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="number-trivia__footer">
              <p className="number-trivia__footer-text number-trivia__footer-text--optional">
                {scoreboard.final
                  ? `🏆 ${winner?.participantName ?? 'Winner'} takes Number Trivia.`
                  : scoreboard.phase === 'duel'
                    ? 'Accuracy decides first; response time only breaks otherwise equal answers.'
                    : scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
                      ? `The finalists begin with ${NUMBER_TRIVIA_DUEL_STARTING_LIVES} lives each.`
                    : ''}
              </p>
              {!scoreboard.final && humanStanding?.eliminatedRound !== null ? (
                <div className="number-trivia__spectator-actions" role="group" aria-label="Eliminated player options">
                  <button className="number-trivia__button number-trivia__button--secondary" type="button" onClick={continueFromScoreboard}>
                    Keep watching
                  </button>
                  <button className="number-trivia__button number-trivia__button--primary" type="button" onClick={fastForwardToResults}>
                    Fast-forward to results
                  </button>
                </div>
              ) : (
                <button className="number-trivia__button number-trivia__button--primary" type="button" onClick={continueFromScoreboard}>
                  {scoreboard.phase === 'qualifier' && scoreboard.roundNumber === NUMBER_TRIVIA_TOTAL_ROUNDS
                    ? 'Start three-life final'
                    : 'Continue'}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
