import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seededPickN, mulberry32 } from '../../store/rng';
import type { GenericMinigameProps } from '../../minigames/reactComponents';
import { NUMBER_TRIVIA_QUESTIONS } from './numberTriviaData';
import {
  compareTriviaStandings,
  computeNumberTriviaRoundScore,
  createNumberTriviaAiRng,
  formatTriviaTimeMs,
  getNumberTriviaEliminationCount,
  getTriviaHint,
  NUMBER_TRIVIA_MAX_ATTEMPTS,
  NUMBER_TRIVIA_TOTAL_ROUNDS,
  simulateNumberTriviaAiPerformance,
  type TriviaRoundPerformance,
  type TriviaStanding,
} from './numberTriviaUtils';
import './NumberTrivia.css';

interface ScoreboardState {
  roundNumber: number;
  answer: number;
  eliminatedIds: string[];
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
    return seededPickN(rng, NUMBER_TRIVIA_QUESTIONS, NUMBER_TRIVIA_TOTAL_ROUNDS);
  }, [seed]);

  const humanId = useMemo(
    () => resolvedParticipants.find((participant) => participant.isHuman)?.id ?? resolvedParticipants[0]?.id ?? 'human',
    [resolvedParticipants],
  );

  const [standings, setStandings] = useState<TriviaStanding[]>(() => makeInitialStandings(resolvedParticipants));
  const [roundIndex, setRoundIndex] = useState(0);
  const [answerInput, setAnswerInput] = useState('');
  const [hint, setHint] = useState('Enter your answer below');
  const [roundAttempts, setRoundAttempts] = useState(0);
  const [closestDistance, setClosestDistance] = useState<number | undefined>(undefined);
  const [scoreboard, setScoreboard] = useState<ScoreboardState | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const roundStartedAtRef = useRef(0);

  useEffect(() => {
    roundStartedAtRef.current = Date.now();
  }, []);

  const currentRoundNumber = roundIndex + 1;
  const currentQuestion = chosenQuestions[roundIndex];
  const activeStandings = useMemo(
    () => standings.filter((entry) => entry.eliminatedRound === null),
    [standings],
  );
  const humanStanding = standings.find((entry) => entry.participantId === humanId) ?? null;
  const humanStillActive = humanStanding?.eliminatedRound === null;

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
    const eliminationCount = getNumberTriviaEliminationCount(effectiveRoundNumber, rankedActive.length);
    const eliminatedIds = rankedActive
      .slice(Math.max(0, rankedActive.length - eliminationCount))
      .map((entry) => entry.participantId);

    const nextStandings = updated
      .map((entry) => (
        eliminatedIds.includes(entry.participantId) && entry.eliminatedRound === null
          ? { ...entry, eliminatedRound: effectiveRoundNumber }
          : entry
      ))
      .sort(compareTriviaStandings);

    const remainingCount = nextStandings.filter((entry) => entry.eliminatedRound === null).length;
    const final = effectiveRoundNumber >= NUMBER_TRIVIA_TOTAL_ROUNDS || remainingCount <= 1;

    setStandings(nextStandings);
    setRoundIndex(effectiveRoundIndex);
    const nextScoreboard: ScoreboardState = {
      roundNumber: effectiveRoundNumber,
      answer: effectiveQuestion.answer,
      eliminatedIds,
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

  const submitAnswer = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard) return;
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
      resolveRound({
        guessed: true,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: 0,
      });
      return;
    }

    if (nextAttempts >= NUMBER_TRIVIA_MAX_ATTEMPTS) {
      setHint(`Out of attempts — the answer was ${currentQuestion.answer}.`);
      resolveRound({
        guessed: false,
        attempts: nextAttempts,
        timeMs: Date.now() - roundStartedAtRef.current,
        closestDistance: bestDistance,
      });
      return;
    }

    setHint(getTriviaHint(guess, currentQuestion.answer));
    setAnswerInput('');
  }, [
    answerInput,
    closestDistance,
    currentQuestion,
    humanStillActive,
    resolveRound,
    roundAttempts,
    scoreboard,
  ]);

  const skipQuestion = useCallback(() => {
    if (!currentQuestion || !humanStillActive || scoreboard) return;
    resolveRound({
      guessed: false,
      attempts: Math.max(1, roundAttempts),
      timeMs: Date.now() - roundStartedAtRef.current,
      closestDistance,
      skipped: true,
    });
  }, [closestDistance, currentQuestion, humanStillActive, resolveRound, roundAttempts, scoreboard]);

  const continueFromScoreboard = useCallback(() => {
    if (!scoreboard) return;
    if (scoreboard.final) {
      finishCompetition(scoreboard.standings);
      return;
    }
    const nextRoundIndex = roundIndex + 1;
    const nextHumanStanding = standings.find((entry) => entry.participantId === humanId) ?? null;

    roundStartedAtRef.current = Date.now();
    setAnswerInput('');
    setRoundAttempts(0);
    setClosestDistance(undefined);
    setInputError(null);

    if (nextHumanStanding?.eliminatedRound === null) {
      setHint('Enter your answer below');
      setRoundIndex(nextRoundIndex);
      setScoreboard(null);
      return;
    }

    setHint('You have been eliminated. The remaining players will finish the tournament.');
    resolveRound(undefined, {
      roundIndex: nextRoundIndex,
      sourceStandings: standings,
    });
  }, [finishCompetition, humanId, resolveRound, roundIndex, scoreboard, standings]);

  const fastForwardToResults = useCallback(() => {
    if (!scoreboard) return;
    let simulatedStandings = scoreboard.standings;
    let finalScoreboard = scoreboard;
    for (let nextRoundIndex = scoreboard.roundNumber; nextRoundIndex < NUMBER_TRIVIA_TOTAL_ROUNDS; nextRoundIndex += 1) {
      const simulatedRound = resolveRound(undefined, {
        roundIndex: nextRoundIndex,
        sourceStandings: simulatedStandings,
      });
      if (!simulatedRound) break;
      simulatedStandings = simulatedRound.standings;
      finalScoreboard = simulatedRound;
      if (simulatedRound.final) break;
    }
    setStandings(finalScoreboard.standings);
    setRoundIndex(finalScoreboard.roundNumber - 1);
    setScoreboard(finalScoreboard);
  }, [resolveRound, scoreboard]);

  const winner = scoreboard?.standings[0] ?? standings.slice().sort(compareTriviaStandings)[0] ?? null;
  const rootClassName = scoreboard ? 'number-trivia number-trivia--scoreboard' : 'number-trivia number-trivia--playing';

  return (
    <div className={rootClassName} data-testid="number-trivia-root">
      <div className="number-trivia__shell">
        {!scoreboard && currentQuestion && (
          <section className="number-trivia__round" aria-live="polite">
            <header className="number-trivia__header number-trivia__header--playing">
              <p className="number-trivia__eyebrow">
                Round {Math.min(currentRoundNumber, NUMBER_TRIVIA_TOTAL_ROUNDS)} of {NUMBER_TRIVIA_TOTAL_ROUNDS}
              </p>
              <h2 className="number-trivia__title">Number Trivia</h2>
              <p className="number-trivia__subtitle number-trivia__subtitle--compact">
                Question and answer stay together on one gameplay screen.
              </p>
            </header>

            <section className="number-trivia__summary number-trivia__summary--playing" aria-label="Tournament summary">
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">Players left</span>
                <strong>{activeStandings.length}</strong>
              </div>
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">Your total</span>
                <strong>{humanStanding?.cumulativeScore ?? 0}</strong>
              </div>
              <div className="number-trivia__summary-item">
                <span className="number-trivia__summary-label">Attempts used</span>
                <strong>{roundAttempts}</strong>
              </div>
            </section>

            <div className="number-trivia__question-card number-trivia__gameplay-card" aria-label="Gameplay panel">
              <p className="number-trivia__question-label">Question</p>
              <p className="number-trivia__question-text">{currentQuestion.prompt}</p>

              <div className="number-trivia__status-card number-trivia__status-card--embedded">
                <p className="number-trivia__status-text">{hint}</p>
                <p className="number-trivia__status-meta">
                  {humanStillActive
                    ? `${NUMBER_TRIVIA_MAX_ATTEMPTS - roundAttempts} attempts remaining`
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
                    onChange={(event) => setAnswerInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitAnswer();
                    }}
                    aria-label="Answer input"
                  />
                  <button className="number-trivia__button number-trivia__button--primary" type="button" onClick={submitAnswer}>
                    Submit
                  </button>
                  <button className="number-trivia__button number-trivia__button--secondary" type="button" onClick={skipQuestion}>
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
          <section className="number-trivia__scoreboard" aria-label={scoreboard.final ? 'Final scoreboard' : `Round ${scoreboard.roundNumber} scoreboard`}>
            <header className="number-trivia__header number-trivia__header--scoreboard">
              <p className="number-trivia__eyebrow">
                {scoreboard.final ? 'Final results' : `Round ${scoreboard.roundNumber} complete`}
              </p>
              <h2 className="number-trivia__title">Number Trivia Scoreboard</h2>
              <p className="number-trivia__subtitle">
                {scoreboard.final
                  ? 'The tournament is over.'
                  : 'This is the between-round results screen. Continue when you are ready for the next question.'}
              </p>
            </header>

            <div className="number-trivia__question-card number-trivia__question-card--compact">
              <p className="number-trivia__question-label">{scoreboard.final ? 'Final scoreboard' : `Round ${scoreboard.roundNumber} scoreboard`}</p>
              <p className="number-trivia__question-text">Correct answer: {scoreboard.answer}</p>
              {scoreboard.eliminatedIds.length > 0 ? (
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
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">Round</th>
                    <th scope="col">Total</th>
                    <th scope="col">Time</th>
                    <th scope="col">Attempts</th>
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
                        <td>{index + 1}</td>
                        <td>
                          {entry.participantName}
                          {entry.isHuman ? ' (You)' : ''}
                        </td>
                        <td>{entry.lastRoundScore}</td>
                        <td>{entry.cumulativeScore}</td>
                        <td>{formatTriviaTimeMs(entry.lastRoundTimeMs)}</td>
                        <td>{entry.lastRoundAttempts || '—'}</td>
                        <td>
                          {isEliminated
                            ? `Eliminated R${entry.eliminatedRound}`
                            : scoreboard.final && index === 0
                              ? 'Winner'
                              : 'Advances'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="number-trivia__footer">
              <p className="number-trivia__footer-text">
                {scoreboard.final
                  ? `🏆 ${winner?.participantName ?? 'Winner'} takes Number Trivia.`
                  : 'Review the standings, then continue to the next round.'}
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
                  Continue
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
