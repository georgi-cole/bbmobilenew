import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { I18nProvider } from '../../src/i18n';
import { store } from '../../src/store/store';

vi.mock('../../src/services/sound/SoundManager', () => ({
  SoundManager: { play: vi.fn(), stop: vi.fn() },
}));

vi.mock('../../src/components/ClosestWithoutGoingOverComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/BiographyBlitzComp/biography_blitz_game', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/FamousFiguresComp/FamousFiguresComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/SilentSaboteurComp/SilentSaboteurComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/MajorityRulesComp/MajorityRulesComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/minigames/crystalPathShattered/CrystalPathShatteredGame', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/BlackjackTournamentComp/BlackjackTournamentComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/WildcardWesternComp/WildcardWesternComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/CodeBreakerComp/CodeBreakerComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/TetrisComp/TetrisComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/TiltLabyrinthComp/TiltLabyrinthComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/HouseOfCardsComp/HouseOfCardsComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/MemoryColorsComp/MemoryColorsComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/TrapAuction/TrapAuction', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/components/ColorMatchComp/ColorMatchComp', () => ({
  default: () => <div data-testid="mock-react-game" />,
}));
vi.mock('../../src/minigames/reactComponents', () => ({
  default: {
    Capitalization: () => <div data-testid="capitalization-game" />,
  },
}));
vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

import MinigameHost from '../../src/components/MinigameHost/MinigameHost';

function renderHost(ui: React.ReactElement) {
  return render(
    <Provider store={store}>
      <I18nProvider>{ui}</I18nProvider>
    </Provider>,
  );
}

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
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('uses an explicit start action and removes the destructive X from the rules card', () => {
    renderHost(
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
    renderHost(
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
    renderHost(
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
    renderHost(
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
    renderHost(
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
    renderHost(
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
