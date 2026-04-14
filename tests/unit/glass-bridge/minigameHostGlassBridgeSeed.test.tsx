/**
 * MinigameHost — Crystal Path seed isolation test.
 *
 * Bug: MinigameHost was forwarding `gameOptions.seed` (the challenge-derived
 * seed) directly to `GlassBridgeComp`. When `game.seed` stayed the same on a
 * reload/restart, the bridge layout and order shuffle repeated every session.
 *
 * Fix: MinigameHost no longer passes `seed` to `GlassBridgeComp`. The component
 * now generates a fresh crypto-random session seed when no explicit non-zero
 * seed is provided, while still honouring explicit dev/test seeds.
 *
 * Tests verify:
 *  1. Hosted Crystal Path receives seed=undefined even for a non-zero
 *     challenge seed.
 *  2. Hosted Crystal Path also receives seed=undefined for seed=0.
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

let capturedGlassBridgeSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedGlassBridgeSeed = seed;
    return <div data-testid="gb-comp" />;
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
vi.mock('../../../src/components/BlackjackTournamentComp/BlackjackTournamentComp', () => ({
  default: () => <div data-testid="bj-comp" />,
}));
vi.mock('../../../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: () => <div data-testid="rw-comp" />,
}));
vi.mock('../../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

const GLASS_BRIDGE_GAME = {
  key: 'glass_bridge_brutal',
  title: 'The Crystal Path',
  description: 'Step across a path of paired crystal platforms one row at a time.',
  instructions: ['Cross the bridge.'],
  resultMode: 'placement' as const,
  metricKind: 'accuracy' as const,
  metricLabel: 'Placement',
  timeLimitMs: 160_000,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'GlassBridge',
  legacy: false,
  weight: 1,
  category: 'endurance' as const,
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

describe('MinigameHost — Crystal Path seed isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedGlassBridgeSeed = 'NOT_RENDERED';
    capturedCwgoSeed = 'NOT_RENDERED';
  });

  afterEach(() => vi.useRealTimers());

  it('GlassBridgeComp receives seed=undefined even when gameOptions.seed is non-zero', async () => {
    const challengeSeed = 99999;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={GLASS_BRIDGE_GAME}
          gameOptions={{ seed: challengeSeed }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('gb-comp')).toBeTruthy();
    expect(capturedGlassBridgeSeed).toBeUndefined();
  });

  it('GlassBridgeComp receives seed=undefined for seed=0 as well', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={GLASS_BRIDGE_GAME}
          gameOptions={{ seed: 0 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('gb-comp')).toBeTruthy();
    expect(capturedGlassBridgeSeed).toBeUndefined();
  });

  it('ClosestWithoutGoingOver still receives the challenge seed unchanged', async () => {
    const challengeSeed = 77777;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={CWGO_GAME}
          gameOptions={{ seed: challengeSeed }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    expect(screen.getByTestId('cwgo-comp')).toBeTruthy();
    expect(capturedCwgoSeed).toBe(challengeSeed);
  });
});
