import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HangmanChallengeComp from '../HangmanChallengeComp';
import { getSolutionLetters, pickRoundWords } from '../hangmanChallengeEngine';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'ai-1', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
];

describe('HangmanChallengeComp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the CTA before leaving the intro screen', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole('button', { name: /enter round/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/solution board/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }));

    expect(screen.getByLabelText(/solution board/i)).toBeInTheDocument();
  });

  it('renders the compact playfield without the removed intel and wrong-letter panels', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />);

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }));

    expect(screen.queryByText('Intel')).toBeNull();
    expect(screen.queryByText('Wrong letters')).toBeNull();

    const board = screen.getByLabelText(/solution board/i);
    const letterBoard = screen.getByLabelText(/letter board/i);
    const playfield = board.closest('.hangman-challenge__playfield');

    expect(playfield).toBeTruthy();
    expect(playfield?.children[0]).toBe(board);
    expect(playfield?.children[1]).toContainElement(screen.getByText('Mystery box'));
    expect(playfield?.children[2]).toBe(letterBoard);
    expect(screen.getByText('Timer').closest('.hangman-challenge__header')).toBeTruthy();
  });

  it('renders a compact two-line round summary after completing a round', () => {
    render(<HangmanChallengeComp participants={participants} seed={42} />);

    fireEvent.click(screen.getByRole('button', { name: /enter round/i }));

    for (const letter of getSolutionLetters(pickRoundWords(42)[0].text)) {
      fireEvent.click(screen.getByRole('button', { name: letter }));
    }

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.click(screen.getByRole('button', { name: /continue to scoreboard/i }));

    const scoreboard = screen.getByLabelText(/round scoreboard/i);
    const firstRow = scoreboard.querySelector<HTMLElement>('.hangman-challenge__score-row');

    expect(firstRow).not.toBeNull();
    if (!firstRow) {
      throw new Error('Expected a score row to be rendered');
    }

    expect(firstRow.querySelector('.hangman-challenge__score-primary-row')).toBeTruthy();
    expect(firstRow.querySelector('.hangman-challenge__score-secondary-row')).toBeTruthy();
    expect(within(firstRow).getByText(/total/i)).toBeInTheDocument();
    expect(within(firstRow).getByText(/\+\d+/)).toBeInTheDocument();
  });
});
