import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

import MinigameHost from '../../src/components/MinigameHost/MinigameHost';

vi.mock('../../src/services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn() },
}));

const SIMPLE_COMPONENT_MOCKS = [
  '../../src/components/ClosestWithoutGoingOverComp',
  '../../src/components/HoldTheWallComp/HoldTheWallComp',
  '../../src/components/BiographyBlitzComp/biography_blitz_game',
  '../../src/components/FamousFiguresComp/FamousFiguresComp',
  '../../src/components/SilentSaboteurComp/SilentSaboteurComp',
  '../../src/components/MajorityRulesComp/MajorityRulesComp',
  '../../src/components/GlassBridgeComp/GlassBridgeComp',
  '../../src/minigames/crystalPathShattered/CrystalPathShatteredGame',
  '../../src/components/BlackjackTournamentComp/BlackjackTournamentComp',
  '../../src/components/RiskWheelComp/RiskWheelComp',
  '../../src/components/WildcardWesternComp/WildcardWesternComp',
  '../../src/components/CodeBreakerComp/CodeBreakerComp',
  '../../src/components/TetrisComp/TetrisComp',
  '../../src/components/TiltLabyrinthComp/TiltLabyrinthComp',
  '../../src/components/HouseOfCardsComp/HouseOfCardsComp',
  '../../src/components/MemoryColorsComp/MemoryColorsComp',
  '../../src/components/TrapAuction/TrapAuction',
  '../../src/components/ColorMatchComp/ColorMatchComp',
] as const;

for (const modulePath of SIMPLE_COMPONENT_MOCKS) {
  vi.mock(modulePath, () => ({ default: () => <div data-testid="mock-react-game" /> }));
}

vi.mock('../../src/minigames/reactComponents', () => ({
  default: {
    Capitalization: () => <div data-testid="capitalization-game" />,
  },
}));

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

const GAME = {
  key: 'quickTap',
  title: 'Quick Tap Race',
  description: 'Tap as many times as possible.',
  instructions: ['Tap the screen as fast as you can.', 'Beat the clock!'],
  metricKind: 'count' as const,
  metricLabel: 'Taps',
  timeLimitMs: 30_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  modulePath: 'quick-tap.js',
  legacy: true,
  weight: 2,
  category: 'arcade' as const,
  retired: false,
};

const PARTICIPANTS = [
  { id: 'p0', name: 'Human', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'p1', name: 'AI-1', isHuman: false, precomputedScore: 80, previousPR: null },
  { id: 'p2', name: 'AI-2', isHuman: false, precomputedScore: 60, previousPR: null },
];

function openUtilityMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Open minigame menu' }));
}

function requestExit() {
  openUtilityMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: /Leave competition/i }));
}

describe('MinigameHost utility dock and early-exit contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('uses an explicit start action and removes the destructive X from the rules card', () => {
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Start competition' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dismiss challenge/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open minigame menu' })).toBeInTheDocument();
  });

  it('lets the player cancel an exit request without leaving the initial rules', () => {
    const onDone = vi.fn();
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={onDone}
      />,
    );

    requestExit();
    expect(screen.getByRole('heading', { name: 'Leave this competition?' })).toBeInTheDocument();
    expect(screen.getByText(/score will be recorded as 0/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));

    expect(screen.getByRole('button', { name: 'Start competition' })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('confirms a score-0 exit through the existing partial-results flow', () => {
    const onDone = vi.fn();
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={onDone}
      />,
    );

    requestExit();
    fireEvent.click(screen.getByRole('button', { name: 'Exit with 0' }));

    expect(screen.getByRole('heading', { name: 'Exited early' })).toBeInTheDocument();
    expect(screen.getByText(/AI-1 wins/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(0, true);
  });

  it('reopens rules during the countdown and pauses the host countdown while open', async () => {
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start competition' }));
    expect(screen.getByText('3')).toBeInTheDocument();

    openUtilityMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/i }));
    expect(screen.getByText('Quick reference')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to countdown' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText('3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Return to countdown' }));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('reopens and closes rules over active gameplay without completing the game', async () => {
    const onDone = vi.fn();
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={onDone}
        skipRules
        skipCountdown
      />,
    );

    await act(async () => {
      vi.runAllTimers();
    });
    expect(screen.getByTestId('legacy-game')).toBeInTheDocument();

    openUtilityMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /View rules/i }));
    expect(screen.getByText('Quick reference')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Return to game' }));
    expect(screen.getByTestId('legacy-game')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('requires confirmation before leaving active gameplay', async () => {
    const onDone = vi.fn();
    render(
      <MinigameHost
        game={GAME}
        participants={PARTICIPANTS}
        onDone={onDone}
        skipRules
        skipCountdown
      />,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    requestExit();
    expect(screen.getByRole('heading', { name: 'Leave this competition?' })).toBeInTheDocument();
    expect(screen.getByTestId('legacy-game')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(screen.getByTestId('legacy-game')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});
