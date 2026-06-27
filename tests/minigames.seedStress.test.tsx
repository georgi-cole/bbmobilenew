import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { createCompleteStub, createFinishStub, createReactComponentsProxy } from './helpers/minigameHostHarness';
import { getPoolByFilter, type GameRegistryEntry } from '../src/minigames/registry';

vi.mock('../src/minigames/reactComponents', () => ({
  default: createReactComponentsProxy(),
}));
vi.mock('../src/components/ClosestWithoutGoingOverComp', () => ({
  default: createCompleteStub('ClosestWithoutGoingOver'),
}));
vi.mock('../src/components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: createCompleteStub('HoldTheWall'),
}));
vi.mock('../src/components/BiographyBlitzComp/biography_blitz_game', () => ({
  default: createCompleteStub('BiographyBlitz'),
}));
vi.mock('../src/components/FamousFiguresComp/FamousFiguresComp', () => ({
  default: createCompleteStub('FamousFigures'),
}));
vi.mock('../src/components/SilentSaboteurComp/SilentSaboteurComp', () => ({
  default: createCompleteStub('SilentSaboteur'),
}));
vi.mock('../src/components/MajorityRulesComp/MajorityRulesComp', () => ({
  default: createCompleteStub('MajorityRules'),
}));
vi.mock('../src/components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: createCompleteStub('GlassBridge'),
}));
vi.mock('../src/minigames/crystalPathShattered/CrystalPathShatteredGame', () => ({
  default: createCompleteStub('CrystalPathShattered'),
}));
vi.mock('../src/components/BlackjackTournamentComp/BlackjackTournamentComp', () => ({
  default: createCompleteStub('BlackjackTournament'),
}));
vi.mock('../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: createCompleteStub('RiskWheel'),
}));
vi.mock('../src/components/WildcardWesternComp/WildcardWesternComp', () => ({
  default: createCompleteStub('WildcardWestern'),
}));
vi.mock('../src/components/CodeBreakerComp/CodeBreakerComp', () => ({
  default: createCompleteStub('CodeBreaker'),
}));
vi.mock('../src/components/TetrisComp/TetrisComp', () => ({
  default: createCompleteStub('Tetris'),
}));
vi.mock('../src/components/TiltLabyrinthComp/TiltLabyrinthComp', () => ({
  default: createCompleteStub('TiltLabyrinth'),
}));
vi.mock('../src/components/HouseOfCardsComp/HouseOfCardsComp', () => ({
  default: createCompleteStub('HouseOfCards'),
}));
vi.mock('../src/components/MemoryColorsComp/MemoryColorsComp', () => ({
  default: createCompleteStub('MemoryColors'),
}));
vi.mock('../src/components/TrapAuction/TrapAuction', () => ({
  default: createCompleteStub('TrapAuction'),
}));
vi.mock('../src/components/ColorMatchComp/ColorMatchComp', () => ({
  default: createFinishStub('ColorMatch'),
}));
vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper" />,
}));

import MinigameHost from '../src/components/MinigameHost/MinigameHost';

const ACTIVE_GAMES = getPoolByFilter({ retired: false });
const STRESS_SEEDS = Array.from({ length: 12 }, (_, index) => 100 + index);
const PARTICIPANTS = [
  { id: 'player-1', name: 'You', isHuman: true, avatar: undefined, precomputedScore: 74, previousPR: null },
  { id: 'player-2', name: 'AI 1', isHuman: false, avatar: undefined, precomputedScore: 58, previousPR: 63 },
  { id: 'player-3', name: 'AI 2', isHuman: false, avatar: undefined, precomputedScore: 23, previousPR: 26 },
  { id: 'player-4', name: 'AI 3', isHuman: false, avatar: undefined, precomputedScore: 91, previousPR: 88 },
];

function renderHost(game: GameRegistryEntry, seed: number) {
  const onDone = vi.fn();
  const user = userEvent.setup();

  const renderResult = render(
    <MinigameHost
      game={game}
      gameOptions={{ seed }}
      participants={PARTICIPANTS}
      skipRules
      skipCountdown
      onDone={onDone}
    />,
  );

  return { onDone, user, unmount: renderResult.unmount };
}

describe('MinigameHost seed stress', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it.each(ACTIVE_GAMES)('survives a 12-seed loop for %s', async (game) => {
    for (const seed of STRESS_SEEDS) {
      const { onDone, user, unmount } = renderHost(game, seed);

      const stub = await screen.findByTestId('minigame-stub');
      expect(stub).toBeVisible();

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: new RegExp(`${game.title} minigame`, 'i') })).toBeVisible();
      });

      if (!game.authoritative) {
        const continueButton = await screen.findByRole('button', { name: /Continue ▶/i });
        await user.click(continueButton);
      }

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      unmount();
      cleanup();
    }
  });
});