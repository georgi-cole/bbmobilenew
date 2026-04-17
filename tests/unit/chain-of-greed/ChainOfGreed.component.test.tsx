import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  it('walks through the intro CTAs into the human turn action panel', () => {
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    expect(screen.getAllByText('Chain of Greed')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Round' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeInTheDocument();
    expect(screen.getByTestId('chain-ladder-stage')).toBeInTheDocument();
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i);
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i);
    expect(screen.getByRole('button', { name: /View full ladder/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Current chain ladder')).toBeInTheDocument();
    expect(screen.getByTestId('chain-player-rail')).toBeInTheDocument();
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Equal numbers count as a miss/i).length).toBeGreaterThan(0);
  });

  it('shows a reusable help overlay with the bank and equal-number rules', () => {
    render(<ChainOfGreed participants={participants} seed={7} onFinish={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByText(/Bank secures the active pot/i)).toBeInTheDocument();
    expect(screen.getByText(/Equal numbers count as a miss/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Help' }));
    expect(screen.queryByText(/Bank secures the active pot/i)).not.toBeInTheDocument();
  });

  it('expands and closes the full ladder sheet from the compact preview card', async () => {
    render(<ChainOfGreed participants={participants} seed={5} onFinish={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Round' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.click(screen.getByRole('button', { name: /View full ladder/i }));
    expect(screen.getByText('Chain rewards')).toBeInTheDocument();
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByText('Chain rewards')).not.toBeInTheDocument();
    });
  });
});
