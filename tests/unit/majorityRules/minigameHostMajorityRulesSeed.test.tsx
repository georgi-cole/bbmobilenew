/**
 * MinigameHost — Majority Rules seed isolation test.
 *
 * Bug: MinigameHost was forwarding `gameOptions.seed` (the challenge-derived
 * seed) directly to MajorityRulesComp.  When the same seed was active across
 * sessions (e.g. before resetGame or after a page reload), the same question
 * sequence repeated every hosted game.
 *
 * Fix: MinigameHost's MajorityRules branch now intentionally omits the seed
 * prop.  MajorityRulesComp receives seed=undefined and its useState initializer
 * generates a fresh crypto-random session seed, ensuring each hosted game gets
 * a unique, non-deterministic question sequence.
 *
 * Tests verify:
 *  1. When MinigameHost renders a MajorityRules game with a non-zero
 *     gameOptions.seed, MajorityRulesComp receives seed=undefined.
 *  2. When gameOptions.seed is 0, MajorityRulesComp still receives
 *     seed=undefined.
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

// ── MajorityRulesComp mock — captures the seed prop ──────────────────────────

let capturedMajorityRulesSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/MajorityRulesComp/MajorityRulesComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedMajorityRulesSeed = seed;
    return <div data-testid="mr-comp" />;
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
vi.mock('../../../src/components/ColorMatchComp/ColorMatchComp', () => ({
  default: () => <div data-testid="cm-comp" />,
}));
vi.mock('../../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MAJORITY_RULES_GAME = {
  key: 'majorityRules',
  title: 'Majority Rules',
  description: 'Pick the crowd answer.',
  instructions: [],
  metricKind: 'placement' as const,
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'MajorityRules',
  legacy: false,
  weight: 1,
  category: 'social' as const,
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

describe('MinigameHost — Majority Rules seed isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedMajorityRulesSeed = 'NOT_RENDERED';
    capturedCwgoSeed = 'NOT_RENDERED';
  });
  afterEach(() => vi.useRealTimers());

  it('MajorityRulesComp receives seed=undefined even when gameOptions.seed is non-zero', async () => {
    const CHALLENGE_SEED = 99999;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={MAJORITY_RULES_GAME}
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

    // MajorityRulesComp should now be rendered
    expect(screen.getByTestId('mr-comp')).toBeTruthy();

    // The challenge seed must NOT be forwarded — MajorityRulesComp generates its own
    expect(capturedMajorityRulesSeed).toBeUndefined();
  });

  it('MajorityRulesComp receives seed=undefined for seed=0 as well', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={MAJORITY_RULES_GAME}
          gameOptions={{ seed: 0 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByTestId('mr-comp')).toBeTruthy();
    expect(capturedMajorityRulesSeed).toBeUndefined();
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
