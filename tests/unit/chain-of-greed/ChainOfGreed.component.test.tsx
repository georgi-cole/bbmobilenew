import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChainOfGreed from '../../../src/components/ChainOfGreed/ChainOfGreed';
import {
  CHAIN_TURN_PIPELINE_DURATIONS,
  rankFinalPlayersByScore,
  type ChainOfGreedPlayerState,
} from '../../../src/components/ChainOfGreed/chainOfGreedLogic';

const TURN_PIPELINE_MS = Object.values(CHAIN_TURN_PIPELINE_DURATIONS).reduce((total, value) => total + value, 0);
const ROUND_INTRO_MS = 5_000;

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

  it('keeps the round intro visible for five seconds before starting round one', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    expect(screen.queryByRole('heading', { name: 'Chain of Greed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Round' })).not.toBeInTheDocument();
    expect(screen.getByText('Round starting…')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Build the chain.' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS - 1);
    });
    expect(screen.getByRole('dialog', { name: 'Build the chain.' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Higher' })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
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
    expect(screen.queryByTestId('chain-score-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chain-outcome-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chain-action-cue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chain-event-log')).not.toBeInTheDocument();
    expect(screen.getByTestId('chain-broadcast-board')).toBeInTheDocument();
    const participantPanel = screen.getByTestId('chain-participant-panel');
    expect(participantPanel).toHaveTextContent(/You/i);
    expect(participantPanel).toHaveTextContent(/Choose move/i);
    expect(screen.getByTestId('chain-participant-log')).toHaveTextContent(/Live feed/i);
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Step 0\/8/i);
    expect(screen.getByTestId('chain-inline-status')).toHaveTextContent(/Next 50/i);
    expect(screen.queryByRole('button', { name: /View full ladder/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open chain ladder board' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current chain ladder')).toBeInTheDocument();
    const ladderStage = screen.getByTestId('chain-ladder-stage');
    const higherButton = screen.getByRole('button', { name: 'Higher' });
    const playerRail = screen.getByTestId('chain-player-rail');
    expect(playerRail).toBeInTheDocument();
    expect(ladderStage.compareDocumentPosition(higherButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(higherButton.compareDocumentPosition(playerRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('chain-current-anchor')).toBeInTheDocument();
    expect(screen.queryByText(/Current pot 0/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open help' })).toHaveLength(1);
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
    expect(screen.getByTestId('chain-ladder-stage')).not.toHaveTextContent(/Next\s+Next/i);
    expect(screen.queryByText(/Step 0\/8 • Pot 0 • Next 50/i)).not.toBeInTheDocument();
  });

  it('allows the player to dismiss the round intro by tapping outside its card', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    const introOverlay = screen.getByTestId('chain-round-intro');
    fireEvent.pointerDown(introOverlay);

    expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bank' })).toBeDisabled();
  });

  it('wraps back to the start of the turn order instead of stalling after every player has acted once', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS);
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

  it('shows a reusable help overlay with the bank, equal-number, and LOH final rules', () => {
    render(<ChainOfGreed participants={participants} seed={7} onFinish={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /open help/i }));

    expect(screen.getByText(/Bank secures the active pot/i)).toBeInTheDocument();
    expect(screen.getByText(/Equal numbers count as a miss/i)).toBeInTheDocument();
    expect(screen.getByText(/five standard rounds/i)).toBeInTheDocument();
    expect(screen.getByText(/Round 6 is the LOH final/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Help' }));
    expect(screen.queryByText(/Bank secures the active pot/i)).not.toBeInTheDocument();
  });

  it('expands the full ladder sheet from the compact preview card', async () => {
    render(<ChainOfGreed participants={participants} seed={5} onFinish={() => {}} />);

    fireEvent.pointerDown(screen.getByTestId('chain-round-intro'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Higher' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open chain ladder board' }));
    expect(screen.getByText('Chain rewards')).toBeInTheDocument();
    expect(screen.getAllByText('Max').length).toBeGreaterThan(0);
  });

  it('falls back to initials instead of rendering raw profile image text', () => {
    vi.useFakeTimers();
    const imageTextParticipants = [
      { ...participants[0], name: 'Ate Three', avatar: 'profile photo:photo-d34feb7a-7c42-4864-a8e2-23fa285c69af-1783205172715' },
      ...participants.slice(1),
    ];

    render(<ChainOfGreed participants={imageTextParticipants} seed={42} onFinish={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS);
    });

    expect(screen.queryByText(/profile photo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/photo-d34/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('chain-participant-panel')).toHaveTextContent(/AT/i);
  });

  it('breaks final score ties by fewer mistakes, then fewer banks', () => {
    const makePlayer = (id: string, finalWrongGuesses: number, finalBanks: number) => ({
      ...participants[0],
      id,
      name: id.toUpperCase(),
      avatar: id,
      isHuman: false,
      isEliminated: false,
      totalContribution: 0,
      roundContribution: 0,
      roundCorrectGuesses: 0,
      roundWrongGuesses: 0,
      roundBanks: 0,
      roundBusts: 0,
      totalCorrectGuesses: 0,
      totalWrongGuesses: 0,
      totalBanks: 0,
      totalBusts: 0,
      voteCount: 0,
      semifinalScore: 0,
      finalScore: 500,
      finalWrongGuesses,
      finalBanks,
      turnsTakenThisRound: 0,
      personality: { aggression: 0.5, caution: 0.5, volatility: 0.5, social: 0.5 },
      lastRoundPerformance: 0,
      latestMoment: null,
    }) as ChainOfGreedPlayerState;

    const players = [makePlayer('a', 1, 0), makePlayer('b', 0, 2), makePlayer('c', 0, 1)];
    const ranking = rankFinalPlayersByScore({ a: 500, b: 500, c: 500 }, players, () => 0.5);

    expect(ranking.ordered.map((player) => player.id)).toEqual(['c', 'b', 'a']);
    expect(ranking.tieBreak?.message).toMatch(/Fewer mistakes/i);
  });

  it('keeps banking unavailable until the chain has a pot', () => {
    vi.useFakeTimers();
    render(<ChainOfGreed participants={participants} seed={42} onFinish={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(ROUND_INTRO_MS);
    });

    const bankButton = screen.getByRole('button', { name: 'Bank' });
    expect(bankButton).toBeDisabled();
    expect(bankButton).toHaveAttribute('title', 'Build the chain before banking.');
    expect(screen.getByRole('button', { name: 'Higher' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Lower' })).toBeEnabled();
    expect(screen.queryByText(/You banked 0\./i)).not.toBeInTheDocument();
  });
});
