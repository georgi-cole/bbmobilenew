/**
 * MinigameHost — Risk Wheel seed isolation test.
 *
 * Bug: MinigameHost was forwarding `gameOptions.seed` (the challenge-derived
 * seed) directly to `RiskWheelComp`.  When `game.seed` happened to be the same
 * value on restart (e.g. before resetGame, or after a page reload that resets
 * challenge.nextNonce to 1), the same spin sequence repeated every session.
 *
 * Fix: MinigameHost no longer passes `seed` to `RiskWheelComp`.  The component
 * always receives `seed={undefined}` so its init effect forwards `undefined` to
 * `initRiskWheel`, letting the `prepare()` callback generate a fresh
 * crypto-random seed for every real-game session.
 *
 * Tests verify:
 *  1. When MinigameHost renders a RiskWheel game with a non-zero gameOptions.seed,
 *     RiskWheelComp receives seed=undefined (not the challenge seed).
 *  2. The RISK_WHEEL_NEW_SESSION log is emitted with the ignored seed.
 *  3. Other React minigames (e.g. ClosestWithoutGoingOver) are unaffected — they
 *     still receive the challenge seed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../../src/store/gameSlice';
import challengeReducer from '../../../src/store/challengeSlice';
import MinigameHost from '../../../src/components/MinigameHost/MinigameHost';

// ── RiskWheelComp mock — captures the seed prop ───────────────────────────────

let capturedRiskWheelSeed: number | undefined | 'NOT_RENDERED' = 'NOT_RENDERED';

vi.mock('../../../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: ({ seed }: { seed?: number }) => {
    capturedRiskWheelSeed = seed;
    return <div data-testid="rw-comp" />;
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
vi.mock('../../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-game" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RISK_WHEEL_GAME = {
  key: 'riskWheel',
  title: 'Risk Wheel',
  description: 'Spin for points.',
  instructions: ['Spin the wheel.'],
  metricKind: 'points' as const,
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'RiskWheel',
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

describe('MinigameHost — Risk Wheel seed isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedRiskWheelSeed = 'NOT_RENDERED';
    capturedCwgoSeed = 'NOT_RENDERED';
  });
  afterEach(() => vi.useRealTimers());

  it('RiskWheelComp receives seed=undefined even when gameOptions.seed is non-zero', async () => {
    const CHALLENGE_SEED = 99999;
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={RISK_WHEEL_GAME}
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

    // RiskWheelComp should now be rendered
    expect(screen.getByTestId('rw-comp')).toBeTruthy();

    // The challenge seed must NOT be forwarded — RiskWheel generates its own
    expect(capturedRiskWheelSeed).toBeUndefined();
  });

  it('RiskWheelComp receives seed=undefined for seed=0 as well', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={RISK_WHEEL_GAME}
          gameOptions={{ seed: 0 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });
    expect(screen.getByTestId('rw-comp')).toBeTruthy();
    expect(capturedRiskWheelSeed).toBeUndefined();
  });

  it('RISK_WHEEL_NEW_SESSION is logged with the ignored challenge seed', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const CHALLENGE_SEED = 12345;

    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={RISK_WHEEL_GAME}
          gameOptions={{ seed: CHALLENGE_SEED }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    const newSessionCalls = logSpy.mock.calls.filter(
      (args) => args[0] === 'RISK_WHEEL_NEW_SESSION',
    );
    expect(newSessionCalls.length).toBeGreaterThan(0);
    expect(newSessionCalls[0][1]).toMatchObject({
      source: 'MinigameHost',
      challengeSeedIgnored: CHALLENGE_SEED,
    });

    logSpy.mockRestore();
  });

  it('ClosestWithoutGoingOver (non-RiskWheel) still receives the challenge seed unchanged', async () => {
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
