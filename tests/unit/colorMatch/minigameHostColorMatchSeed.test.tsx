/**
 * MinigameHost — Color Match seed isolation test.
 *
 * Bug: MinigameHost was forwarding `gameOptions.seed` (the challenge-derived
 * seed) to ColorMatchComp via the generic reactComponents path.  When
 * game.seed stayed the same between sessions (e.g. before resetGame or after
 * a page reload), the same color sequence repeated every hosted game.
 *
 * Fix: MinigameHost has a dedicated special-case branch for ColorMatch that
 * intentionally omits the seed prop.  ColorMatchComp then receives
 * seed=undefined and its useState initializer generates a fresh crypto-random
 * session seed, ensuring each session has a unique color order.
 *
 * Tests verify:
 *  1. When MinigameHost renders a ColorMatch game with a non-zero
 *     gameOptions.seed, ColorMatchComp receives seed=undefined.
 *  2. When gameOptions.seed is 0, ColorMatchComp still receives seed=undefined.
 *  3. ClosestWithoutGoingOver (a generic-path game) is unaffected — it still
 *     receives the challenge seed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../src/store/gameSlice';
import challengeReducer from '../../../src/store/challengeSlice';
import MinigameHost from '../../../src/components/MinigameHost/MinigameHost';

// ── ColorMatchComp mock — captures the seed prop ──────────────────────────────

let capturedColorMatchSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/ColorMatchComp/ColorMatchComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedColorMatchSeed = seed;
    return <div data-testid="cm-comp" />;
  },
}));

// ── ClosestWithoutGoingOverComp mock — captures the seed prop ─────────────────

let capturedCwgoSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/ClosestWithoutGoingOverComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedCwgoSeed = seed;
    return <div data-testid="cwgo-comp" />;
  },
}));

// ── Other dependency mocks ────────────────────────────────────────────────────

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
vi.mock('../../../src/components/MajorityRulesComp/MajorityRulesComp', () => ({
  default: () => <div data-testid="mr-comp" />,
}));
vi.mock('../../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COLOR_MATCH_GAME = {
  key: 'colorMatch',
  title: 'Color Match',
  description: 'Match the exact shown color.',
  instructions: [],
  metricKind: 'accuracy' as const,
  metricLabel: 'Accuracy %',
  timeLimitMs: 25_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  implementation: 'react' as const,
  reactComponentKey: 'ColorMatch',
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
  { id: 'p0', name: 'Human', isHuman: true,  precomputedScore: 0,  previousPR: null },
  { id: 'p1', name: 'AI-1',  isHuman: false, precomputedScore: 80, previousPR: null },
];

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, challenge: challengeReducer } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MinigameHost — Color Match seed isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedColorMatchSeed = 'NOT_RENDERED';
    capturedCwgoSeed = 'NOT_RENDERED';
  });
  afterEach(() => vi.useRealTimers());

  it('ColorMatchComp receives seed=undefined even when gameOptions.seed is non-zero', async () => {
    const CHALLENGE_SEED = 99999;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={COLOR_MATCH_GAME}
          gameOptions={{ seed: CHALLENGE_SEED }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    // Advance past countdown → playing phase
    await act(async () => { vi.runAllTimers(); });

    // ColorMatchComp should now be rendered
    expect(screen.getByTestId('cm-comp')).toBeTruthy();

    // The challenge seed must NOT be forwarded — ColorMatchComp generates its own
    expect(capturedColorMatchSeed).toBeUndefined();
  });

  it('ColorMatchComp receives seed=undefined for seed=0 as well', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={COLOR_MATCH_GAME}
          gameOptions={{ seed: 0 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByTestId('cm-comp')).toBeTruthy();
    expect(capturedColorMatchSeed).toBeUndefined();
  });

  it('ClosestWithoutGoingOver (generic-path game) still receives the challenge seed unchanged', async () => {
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
    // CWGO is not affected — it still receives the challenge seed
    expect(capturedCwgoSeed).toBe(CHALLENGE_SEED);
  });
});
