import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NumberTrivia from '../../../src/components/NumberTrivia/NumberTrivia';
import { NUMBER_TRIVIA_QUESTIONS } from '../../../src/components/NumberTrivia/numberTriviaData';
import {
  computeNumberTriviaRoundScore,
  createNumberTriviaAiRng,
  getNumberTriviaDuelLoserId,
  getNumberTriviaEliminationCount,
  getNumberTriviaFinalistIds,
  NUMBER_TRIVIA_READING_BUFFER_MS,
  simulateNumberTriviaAiPerformance,
  type TriviaStanding,
} from '../../../src/components/NumberTrivia/numberTriviaUtils';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 35, previousPR: null },
  { id: 'ai-2', name: 'Atlas', isHuman: false, precomputedScore: 55, previousPR: null },
  { id: 'ai-3', name: 'Cipher', isHuman: false, precomputedScore: 75, previousPR: null },
  { id: 'ai-4', name: 'Echo', isHuman: false, precomputedScore: 95, previousPR: null },
];

function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value;
  };
}

describe('NumberTrivia helpers', () => {
  it('uses the new attached question bank with difficulty tiers', () => {
    expect(NUMBER_TRIVIA_QUESTIONS).toHaveLength(105);
    expect(NUMBER_TRIVIA_QUESTIONS.filter((question) => question.difficulty === 'easy')).toHaveLength(50);
    expect(NUMBER_TRIVIA_QUESTIONS.filter((question) => question.difficulty === 'medium')).toHaveLength(25);
    expect(NUMBER_TRIVIA_QUESTIONS.filter((question) => question.difficulty === 'hard')).toHaveLength(15);
    expect(NUMBER_TRIVIA_QUESTIONS.filter((question) => question.difficulty === 'very-hard')).toHaveLength(15);
    expect(NUMBER_TRIVIA_QUESTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prompt: 'How many minutes are in an hour?', answer: 60, difficulty: 'easy' }),
        expect.objectContaining({ prompt: 'How many countries are in the EU (2026)?', answer: 27, difficulty: 'medium' }),
        expect.objectContaining({ prompt: 'In which year did the Berlin Wall fall?', answer: 1989, difficulty: 'hard' }),
        expect.objectContaining({ prompt: 'In which year did humans first land on the Moon?', answer: 1969, difficulty: 'very-hard' }),
      ]),
    );
    expect(
      NUMBER_TRIVIA_QUESTIONS.some(
        (question) => question.prompt === 'How many housemates typically compete in a season of The Big Eye?',
      ),
    ).toBe(false);
  });

  it('prioritizes solving a question over speed and attempts', () => {
    const solvedSlow = computeNumberTriviaRoundScore({ guessed: true, attempts: 5, timeMs: 9_000 });
    const missedFast = computeNumberTriviaRoundScore({
      guessed: false,
      attempts: 1,
      timeMs: 1_000,
      closestDistance: 1,
    });
    const solvedFastButMessy = computeNumberTriviaRoundScore({ guessed: true, attempts: 5, timeMs: 2_000 });
    const solvedSlowClean = computeNumberTriviaRoundScore({ guessed: true, attempts: 1, timeMs: 8_000 });

    expect(solvedSlow).toBeGreaterThan(missedFast);
    expect(solvedFastButMessy).toBeGreaterThan(solvedSlowClean);
  });

  it('eliminates one player per round instead of wiping out half the field', () => {
    expect(getNumberTriviaEliminationCount(4, 3)).toBe(1);
    expect(getNumberTriviaEliminationCount(4, 5)).toBe(1);
    expect(getNumberTriviaEliminationCount(4, 6)).toBe(1);
  });

  it('keeps the top two after round five and protects genuine cutoff ties', () => {
    const standing = (participantId: string, cumulativeScore: number): TriviaStanding => ({
      participantId,
      participantName: participantId,
      isHuman: false,
      cumulativeScore,
      lastRoundScore: 0,
      lastRoundAttempts: 1,
      lastRoundTimeMs: 1_000,
      lastRoundGuessed: true,
      eliminatedRound: null,
    });

    expect(getNumberTriviaFinalistIds([
      standing('leader', 500),
      standing('second-a', 450),
      standing('second-b', 450),
      standing('fourth', 420),
    ])).toEqual(['leader', 'second-a', 'second-b']);
  });

  it('uses response time only after duel accuracy is equal', () => {
    expect(getNumberTriviaDuelLoserId([
      {
        participantId: 'closer-but-slow',
        performance: { guessed: false, attempts: 3, timeMs: 8_000, closestDistance: 1 },
      },
      {
        participantId: 'farther-but-fast',
        performance: { guessed: false, attempts: 1, timeMs: 2_000, closestDistance: 4 },
      },
    ])).toBe('farther-but-fast');

    expect(getNumberTriviaDuelLoserId([
      {
        participantId: 'fast',
        performance: { guessed: true, attempts: 1, timeMs: 2_000, closestDistance: 0 },
      },
      {
        participantId: 'slow',
        performance: { guessed: true, attempts: 1, timeMs: 4_000, closestDistance: 0 },
      },
    ])).toBe('slow');

    expect(getNumberTriviaDuelLoserId([
      {
        participantId: 'exact-a',
        performance: { guessed: true, attempts: 1, timeMs: 3_000, closestDistance: 0 },
      },
      {
        participantId: 'exact-b',
        performance: { guessed: true, attempts: 1, timeMs: 3_000, closestDistance: 0 },
      },
    ], () => 0.99)).toBe('exact-b');
  });

  it('keeps easy AI answers fast and confident', () => {
    const performance = simulateNumberTriviaAiPerformance(
      {
        precomputedScore: 92,
        roundNumber: 1,
        question: { prompt: 'How many days are in a week?', answer: 7, difficulty: 'easy' },
      },
      sequenceRng([0.2, 0.1, 0.9]),
    );

    expect(performance).toMatchObject({
      guessed: true,
      attempts: 1,
      closestDistance: 0,
    });
    expect(performance.timeMs).toBeGreaterThanOrEqual(2_200);
    expect(performance.timeMs).toBeLessThanOrEqual(6_000);
  });

  it('lets harder questions create hesitant but correct AI runs', () => {
    const performance = simulateNumberTriviaAiPerformance(
      {
        precomputedScore: 60,
        roundNumber: 2,
        question: { prompt: 'In which year was Google founded?', answer: 1998, difficulty: 'hard' },
      },
      sequenceRng([0.5, 0.2, 0.3, 0.9]),
    );

    expect(performance.guessed).toBe(true);
    expect(performance.attempts).toBeGreaterThanOrEqual(2);
    expect(performance.closestDistance).toBe(0);
    expect(performance.timeMs).toBeGreaterThan(4_000);
    expect(performance.timeMs).toBeLessThanOrEqual(16_600);
  });

  it('uses near-miss logic for very hard AI misses', () => {
    const performance = simulateNumberTriviaAiPerformance(
      {
        precomputedScore: 40,
        roundNumber: 4,
        question: { prompt: 'In which year did humans first land on the Moon?', answer: 1969, difficulty: 'very-hard' },
      },
      sequenceRng([0.1, 0.95, 0.2, 0.4, 0.3]),
    );

    expect(performance.guessed).toBe(false);
    expect(performance.attempts).toBe(1);
    expect(performance.closestDistance).toBe(1);
    expect(performance.timeMs).toBeGreaterThanOrEqual(3_000);
    expect(performance.timeMs).toBeLessThanOrEqual(8_500);
  });

  it('gives each AI participant an order-independent rng stream per round', () => {
    const context = {
      precomputedScore: 58,
      roundNumber: 4,
      question: { prompt: 'In which year was the first Nobel Prize awarded?', answer: 1901, difficulty: 'very-hard' as const },
    };

    const aiOneForward = simulateNumberTriviaAiPerformance(
      context,
      createNumberTriviaAiRng({ seed: 12_345, roundNumber: context.roundNumber, participantId: 'ai-1' }),
    );
    const aiTwoForward = simulateNumberTriviaAiPerformance(
      context,
      createNumberTriviaAiRng({ seed: 12_345, roundNumber: context.roundNumber, participantId: 'ai-2' }),
    );

    const aiTwoReverse = simulateNumberTriviaAiPerformance(
      context,
      createNumberTriviaAiRng({ seed: 12_345, roundNumber: context.roundNumber, participantId: 'ai-2' }),
    );
    const aiOneReverse = simulateNumberTriviaAiPerformance(
      context,
      createNumberTriviaAiRng({ seed: 12_345, roundNumber: context.roundNumber, participantId: 'ai-1' }),
    );

    expect(aiOneForward).toEqual(aiOneReverse);
    expect(aiTwoForward).toEqual(aiTwoReverse);
  });
});

describe('NumberTrivia component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  function finishReadingBuffer() {
    act(() => {
      vi.advanceTimersByTime(NUMBER_TRIVIA_READING_BUFFER_MS);
    });
  }

  it('keeps the question and answer input together in the gameplay panel', () => {
    render(
      <NumberTrivia
        participants={participants}
        participantIds={participants.map((participant) => participant.id)}
        seed={7}
      />,
    );

    const gameplayPanel = screen.getByLabelText('Gameplay panel');
    expect(within(gameplayPanel).getByText('Question')).toBeInTheDocument();
    expect(within(gameplayPanel).getByLabelText('Reading time')).toHaveTextContent('3s');
    expect(within(gameplayPanel).getByRole('spinbutton', { name: 'Answer input' })).toBeDisabled();
    finishReadingBuffer();
    expect(within(gameplayPanel).getByRole('spinbutton', { name: 'Answer input' })).toBeEnabled();
    expect(screen.queryByLabelText('Round 1 scoreboard')).toBeNull();
  });

  it('rejects non-integer input instead of truncating it', () => {
    render(
      <NumberTrivia
        participants={participants}
        participantIds={participants.map((participant) => participant.id)}
        seed={7}
      />,
    );

    finishReadingBuffer();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Answer input' }), {
      target: { value: '1.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('Please enter a whole number.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Round 1 scoreboard')).toBeNull();
  });

  it('uses round five as a qualifier and finishes through the three-life duel', () => {
    const onFinish = vi.fn();

    render(
      <NumberTrivia
        onFinish={onFinish}
        participants={participants}
        participantIds={participants.map((participant) => participant.id)}
        seed={7}
      />,
    );

    for (let round = 1; round <= 5; round += 1) {
      const skipButton = screen.queryByRole('button', { name: 'Skip' });
      if (skipButton) {
        finishReadingBuffer();
        fireEvent.click(skipButton);
      }

      const scoreboardLabel = `Round ${round} scoreboard`;
      expect(screen.getByLabelText(scoreboardLabel)).toBeInTheDocument();
      expect(screen.queryByLabelText('Gameplay panel')).toBeNull();
      if (round < 5) {
        const continueButton = screen.queryByRole('button', { name: 'Continue' });
        if (continueButton) fireEvent.click(continueButton);
        else fireEvent.click(screen.getByRole('button', { name: 'Keep watching' }));
      }
    }

    expect(screen.queryByLabelText('Final scoreboard')).toBeNull();
    const startFinalButton = screen.queryByRole('button', { name: 'Start three-life final' });
    if (startFinalButton) fireEvent.click(startFinalButton);
    else fireEvent.click(screen.getByRole('button', { name: 'Keep watching' }));

    let safety = 0;
    while (!screen.queryByLabelText('Final scoreboard') && safety < 20) {
      const duelSkipButton = screen.queryByRole('button', { name: 'Skip' });
      if (duelSkipButton) {
        finishReadingBuffer();
        fireEvent.click(duelSkipButton);
      } else {
        const continueButton = screen.queryByRole('button', { name: 'Continue' });
        if (continueButton) fireEvent.click(continueButton);
        else fireEvent.click(screen.getByRole('button', { name: 'Keep watching' }));
      }
      safety += 1;
    }

    expect(safety).toBeLessThan(20);
    expect(screen.getByLabelText('Final scoreboard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][2]).toMatchObject({
      authoritativeWinnerId: expect.any(String),
      rawResults: expect.any(Object),
    });
  });
});
