import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NumberTrivia from '../../../src/components/NumberTrivia/NumberTrivia';
import {
  computeNumberTriviaRoundScore,
  getNumberTriviaEliminationCount,
} from '../../../src/components/NumberTrivia/numberTriviaUtils';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 35, previousPR: null },
  { id: 'ai-2', name: 'Atlas', isHuman: false, precomputedScore: 55, previousPR: null },
  { id: 'ai-3', name: 'Cipher', isHuman: false, precomputedScore: 75, previousPR: null },
  { id: 'ai-4', name: 'Echo', isHuman: false, precomputedScore: 95, previousPR: null },
];

describe('NumberTrivia helpers', () => {
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

  it('eliminates half the field at the end of round four using the lower half', () => {
    expect(getNumberTriviaEliminationCount(4, 3)).toBe(1);
    expect(getNumberTriviaEliminationCount(4, 5)).toBe(2);
    expect(getNumberTriviaEliminationCount(4, 6)).toBe(3);
  });
});

describe('NumberTrivia component', () => {
  it('shows a round scoreboard and finishes after five rounds', () => {
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
        fireEvent.click(skipButton);
      }

      const scoreboardLabel = round === 5 ? 'Final scoreboard' : `Round ${round} scoreboard`;
      expect(screen.getByLabelText(scoreboardLabel)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    }

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][2]).toMatchObject({
      authoritativeWinnerId: expect.any(String),
      rawResults: expect.any(Object),
    });
  });
});
