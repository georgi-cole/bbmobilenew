/**
 * MinigameHost — House of Cards seed isolation test.
 *
 * Bug: MinigameHost was forwarding `gameOptions.seed` (the challenge-derived
 * seed) directly to `HouseOfCardsComp`. When `game.seed` stayed the same on a
 * restart, the card layout and AI outcomes repeated every session.
 *
 * Fix: MinigameHost no longer passes `seed` to `HouseOfCardsComp`. The
 * component now generates a fresh crypto-random session seed when no explicit
 * non-zero seed is provided, while still honouring explicit dev/test seeds.
 *
 * Tests verify:
 *  1. Hosted HouseOfCards receives seed=undefined even for a non-zero
 *     challenge seed.
 *  2. Hosted HouseOfCards also receives seed=undefined for seed=0.
 *  3. Other React minigames remain unaffected and still receive the challenge
 *     seed unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../src/store/gameSlice';
import challengeReducer from '../../../src/store/challengeSlice';
import MinigameHost from '../../../src/components/MinigameHost/MinigameHost';

let capturedHouseOfCardsSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/HouseOfCardsComp/HouseOfCardsComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedHouseOfCardsSeed = seed;
    return <div data-testid="hoc-comp" />;
  },
}));

let capturedCwgoSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/ClosestWithoutGoingOverComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedCwgoSeed = seed;
    return <div data-testid="cwgo-comp" />;
  },
}));

vi.mock('../../../src/components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: () => <div data-testid="htw-comp" />,
}));
vi.mock('../../../src/components/BiographyBlitzComp/biography_blitz_game', () => ({
  default: () => <div data-testid="bioblitz-comp" />,
}));
vi.mock('../../../src/components/FamousFiguresComp/FamousFiguresComp', () => ({
  default: () => <div data-testid="famous-comp" />,
}));
vi.mock('../../../src/components/SilentSaboteurComp/SilentSaboteurComp', () => ({
  default: () => <div data-testid="ss-comp" />,
}));
vi.mock('../../../src/components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: () => <div data-testid="gb-comp" />,
}));
vi.mock('../../../src/components/BlackjackTournamentComp/BlackjackTournamentComp', () => ({
  default: () => <div data-testid="bj-comp" />,
}));
vi.mock('../../../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: () => <div data-testid="rw-comp" />,
}));
vi.mock('../../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

const HOUSE_OF_CARDS_GAME = {
  key: 'houseOfCards',
  title: 'House of Cards',
  description: 'Match the pairs.',
  instructions: ['Find all pairs.'],
  resultMode: 'placement' as const,
  metricKind: 'points' as const,
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'HouseOfCards',
  legacy: false,
  weight: 1,
  category: 'arcade' as const,
  retired: false,
};

const CWGO_GAME = {
  key: 'dontGoOver',
  title: 'Closest Without Going Over',
  description: 'Get as close as possible.',
  instructions: [],
  metricKind: 'points' as const,
  metricLabel: 'Score',
  timeLimitMs: 30_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  implementation: 'react' as const,
  reactComponentKey: 'ClosestWithoutGoingOver',
  legacy: false,
  weight: 1,
  category: 'arcade' as const,
  retired: false,
};

const PARTICIPANTS = [
  { id: 'p0', name: 'Human', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'p1', name: 'AI-1', isHuman: false, precomputedScore: 80, previousPR: null },
];

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, challenge: challengeReducer } });
}

describe('MinigameHost — House of Cards seed isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedHouseOfCardsSeed = 'NOT_RENDERED';
    capturedCwgoSeed = 'NOT_RENDERED';
  });

  afterEach(() => vi.useRealTimers());

  it('HouseOfCardsComp receives seed=undefined even when gameOptions.seed is non-zero', async () => {
    const CHALLENGE_SEED = 99999;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={HOUSE_OF_CARDS_GAME}
          gameOptions={{ seed: CHALLENGE_SEED }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('hoc-comp')).toBeTruthy();
    expect(capturedHouseOfCardsSeed).toBeUndefined();
  });

  it('HouseOfCardsComp receives seed=undefined for seed=0 as well', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={HOUSE_OF_CARDS_GAME}
          gameOptions={{ seed: 0 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('hoc-comp')).toBeTruthy();
    expect(capturedHouseOfCardsSeed).toBeUndefined();
  });

  it('ClosestWithoutGoingOver (non-HouseOfCards) still receives the challenge seed unchanged', async () => {
    const CHALLENGE_SEED = 77777;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={CWGO_GAME}
          gameOptions={{ seed: CHALLENGE_SEED }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('cwgo-comp')).toBeTruthy();
    expect(capturedCwgoSeed).toBe(CHALLENGE_SEED);
  });
});
