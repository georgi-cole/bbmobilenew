import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChainOfGreed from '../../../src/components/ChainOfGreed/ChainOfGreed';

const TURN_PIPELINE_MS = 420 + 850 + 850 + 900 + 650;

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

    expect(screen.queryByRole('heading', { name: 'Chain of Greed' })).not.toBeInTheDocument();
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
    const header = screen.getByRole('banner');
    expect(within(header).getByText('8 left')).toBeInTheDocument();
    expect(within(header).getByText('0 secured')).toBeInTheDocument();
    expect(screen.queryByText(/Choose your move/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bank is safe, but the first correct guess starts the value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/First correct call starts the climb/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('chain-ladder-stage')).toBeInTheDocument();
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i);
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i);
    expect(screen.getByRole('button', { name: /View full ladder/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Current chain ladder')).toBeInTheDocument();
    const ladderStage = screen.getByTestId('chain-ladder-stage');
    const higherButton = screen.getByRole('button', { name: 'Higher' });
    const playerRail = screen.getByTestId('chain-player-rail');
    expect(playerRail).toBeInTheDocument();
    expect(ladderStage.compareDocumentPosition(higherButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(higherButton.compareDocumentPosition(playerRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('chain-current-anchor')).toBeInTheDocument();
    expect(screen.queryByText(/Current pot 0/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open help' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
    expect(screen.getByTestId('chain-ladder-stage')).not.toHaveTextContent(/Next\s+Next/i);
    expect(screen.queryByText(/Step 0\/8 • Pot 0 • Next 50/i)).not.toBeInTheDocument();
  });

  it('wraps back to the start of the turn order instead of stalling after every player has acted once', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(950);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Higher' }));

    act(() => {
      vi.advanceTimersByTime(participants.length * (TURN_PIPELINE_MS + 2200));
    });

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeInTheDocument();
    expect(screen.queryByText(/is reading the board/i)).not.toBeInTheDocument();
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

  it('locks a bank choice, stages the outcome, and still requires a guess afterward', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(950);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Bank' }));

    expect(screen.getByText('You chose BANK.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Higher' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(421);
    });

    expect(screen.getByTestId('chain-turn-reveal')).toHaveTextContent(/Bank secured/i);

    act(() => {
      vi.advanceTimersByTime(850);
    });

    act(() => {
      vi.advanceTimersByTime(850);
    });

    act(() => {
      vi.advanceTimersByTime(900);
    });

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.getByRole('button', { name: 'Banked' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Higher' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeEnabled();
    expect(screen.getAllByText(/You banked 0\./i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('chain-event-log')).toHaveTextContent(/You banked 0./i);
  });
});
