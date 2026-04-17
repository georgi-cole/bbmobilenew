import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChainOfGreed from '../../../src/components/ChainOfGreed/ChainOfGreed';

const participants = [
  { id: 'human', name: 'You', isHuman: true, precomputedScore: 75, previousPR: null },
  { id: 'mira', name: 'Mira', isHuman: false, precomputedScore: 71, previousPR: null },
  { id: 'alex', name: 'Alex', isHuman: false, precomputedScore: 69, previousPR: null },
  { id: 'nina', name: 'Nina', isHuman: false, precomputedScore: 67, previousPR: null },
  { id: 'sasha', name: 'Sasha', isHuman: false, precomputedScore: 65, previousPR: null },
  { id: 'eli', name: 'Eli', isHuman: false, precomputedScore: 64, previousPR: null },
  { id: 'lena', name: 'Lena', isHuman: false, precomputedScore: 62, previousPR: null },
  { id: 'jules', name: 'Jules', isHuman: false, precomputedScore: 60, previousPR: null },
];

describe('ChainOfGreed component', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts round one automatically after a brief round intro flash', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Chain of Greed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Round' })).not.toBeInTheDocument();
    expect(screen.getByText('Round starting…')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.queryByRole('button', { name: 'Higher' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeInTheDocument();
    expect(screen.queryByText(/Choose your move/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bank is safe, but the first correct guess starts the value/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('chain-ladder-stage')).toBeInTheDocument();
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i);
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i);
    expect(screen.getByRole('button', { name: /View full ladder/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Current chain ladder')).toBeInTheDocument();
    expect(screen.getByTestId('chain-player-rail')).toBeInTheDocument();
    expect(screen.getByTestId('chain-current-anchor')).toBeInTheDocument();
    expect(screen.getByText(/Current pot 0/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open help' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
    expect(screen.getByTestId('chain-ladder-stage')).not.toHaveTextContent(/Next\s+Next/i);
  });

  it('shows a reusable help overlay with the bank and equal-number rules', () => {
    render(<ChainOfGreed participants={participants} seed={7} onFinish={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /open help/i }));

    expect(screen.getByText(/Bank secures the active pot/i)).toBeInTheDocument();
    expect(screen.getByText(/Equal numbers count as a miss/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Help' }));
    expect(screen.queryByText(/Bank secures the active pot/i)).not.toBeInTheDocument();
  });

  it('expands the full ladder sheet from the compact preview card', async () => {
    render(<ChainOfGreed participants={participants} seed={5} onFinish={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /View full ladder/i }));
    expect(screen.getByText('Chain rewards')).toBeInTheDocument();
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
  });
});
