/**
 * MinigameHost — dismiss / close button behavior tests.
 *
 * Root cause: MinigameHost's dismiss button (rules screen) and playing-phase
 * close button both called `onDone(0, true)` directly, bypassing the results
 * screen.  This meant an accidental tap of ✕ would immediately fire onDone
 * with partial=true before any gameplay occurred, causing GameScreen to crown
 * a winner without user awareness.
 *
 * Fix: both buttons now route through `setPhase('results')` so the player
 * sees the "🚪 Exited Early" screen and must click "Continue ▶" to confirm.
 *
 * Tests verify:
 *  1. Clicking ✕ on the rules modal transitions to results screen (does NOT
 *     immediately fire onDone).
 *  2. Clicking Continue on the results screen fires onDone with partial=true.
 *  3. Clicking ✕ during the playing phase transitions to results screen (does
 *     NOT immediately fire onDone).
 *  4. Clicking Continue after playing-phase exit fires onDone with partial=true.
 *  5. Normal completion (legacy onComplete) still fires onDone with partial=false
 *     via the results screen — no regression.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import MinigameHost from '../../src/components/MinigameHost/MinigameHost';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock all React minigame components so they don't pull in heavy dependencies
vi.mock('../../src/components/ClosestWithoutGoingOverComp', () => ({
  default: () => <div data-testid="cwgo-comp" />,
}));
vi.mock('../../src/components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: () => <div data-testid="htw-comp" />,
}));
vi.mock('../../src/components/BiographyBlitzComp/biography_blitz_game', () => ({
  default: () => <div data-testid="bioblitz-comp" />,
}));
vi.mock('../../src/components/FamousFiguresComp/FamousFiguresComp', () => ({
  default: () => <div data-testid="famous-comp" />,
}));
vi.mock('../../src/components/SilentSaboteurComp/SilentSaboteurComp', () => ({
  default: () => <div data-testid="ss-comp" />,
}));
vi.mock('../../src/components/GlassBridgeComp/GlassBridgeComp', () => ({
  default: () => <div data-testid="gb-comp" />,
}));
vi.mock('../../src/components/BlackjackTournamentComp/BlackjackTournamentComp', () => ({
  default: () => <div data-testid="bj-comp" />,
}));
vi.mock('../../src/components/RiskWheelComp/RiskWheelComp', () => ({
  default: () => <div data-testid="rw-comp" />,
}));

// LegacyMinigameWrapper: captures the onComplete callback so tests can
// simulate the legacy game reporting its final score.
let capturedLegacyOnComplete: ((result: { value: number }) => void) | null = null;

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: ({ onComplete }: { onComplete: (result: { value: number }) => void }) => {
    capturedLegacyOnComplete = onComplete;
    return <div data-testid="legacy-game" />;
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const LEGACY_GAME = {
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

const PLACEMENT_GAME = {
  key: 'riskWheel',
  title: 'Risk the Wheel',
  description: 'Eliminate players until one remains.',
  instructions: ['Spin the wheel.', 'Avoid elimination.'],
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

const PARTICIPANTS = [
  { id: 'p0', name: 'Human', isHuman: true,  precomputedScore: 0,  previousPR: null },
  { id: 'p1', name: 'AI-1',  isHuman: false, precomputedScore: 80, previousPR: null },
  { id: 'p2', name: 'AI-2',  isHuman: false, precomputedScore: 60, previousPR: null },
];

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, challenge: challengeReducer } });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MinigameHost — dismiss / close buttons route through results screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedLegacyOnComplete = null;
  });
  afterEach(() => vi.useRealTimers());

  // ── Rules-screen dismiss ──────────────────────────────────────────────

  it('clicking ✕ on the rules screen does NOT immediately fire onDone', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
        />
      </Provider>,
    );

    // The rules modal should be visible with a dismiss button
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i });

    await act(async () => { fireEvent.click(dismissBtn); });

    // onDone must NOT have fired yet
    expect(onDone).not.toHaveBeenCalled();
  });

  it('clicking ✕ on the rules screen shows the "Exited Early" results screen', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
        />
      </Provider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    });

    // Results screen with "Exited Early" heading should now appear
    expect(screen.getByText('🚪 Exited Early')).toBeTruthy();
    // Continue button should be present
    expect(screen.getByRole('button', { name: /continue/i })).toBeTruthy();
  });

  it('clicking Continue on the Exited-Early results screen calls onDone(0, true)', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
        />
      </Provider>,
    );

    // Dismiss the rules modal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    });
    expect(onDone).not.toHaveBeenCalled();

    // Click Continue to confirm the exit
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    // rawValue=0, partial=true
    expect(onDone).toHaveBeenCalledWith(0, true);
  });

  // ── Playing-phase close button ──────────────────────────────────────

  it('clicking ✕ during playing does NOT immediately fire onDone', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
          skipRules      // go straight to countdown → playing
          skipCountdown  // skip countdown timer
        />
      </Provider>,
    );

    // Advance timers to reach the playing phase
    await act(async () => { vi.runAllTimers(); });

    const closeBtn = screen.getByRole('button', { name: /exit minigame/i });
    await act(async () => { fireEvent.click(closeBtn); });

    // onDone must NOT have fired yet
    expect(onDone).not.toHaveBeenCalled();
  });

  it('clicking ✕ during playing shows the "Exited Early" results screen', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /exit minigame/i }));
    });

    expect(screen.getByText('🚪 Exited Early')).toBeTruthy();
  });

  it('clicking Continue after playing-phase exit calls onDone(0, true)', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    // Click the playing close button
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /exit minigame/i }));
    });
    expect(onDone).not.toHaveBeenCalled();

    // Click Continue to confirm
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(0, true);
  });

  it('placement-based games show ranks instead of numeric scores after an early exit', async () => {
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={PLACEMENT_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /exit minigame/i }));
    });

    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();
    expect(screen.queryByText(/Placement:/i)).toBeNull();
    expect(screen.queryByText(/\b80\b/)).toBeNull();
    expect(screen.queryByText(/\b60\b/)).toBeNull();
  });

  // ── Regression: normal countdown → playing flow is unaffected ──────

  it('the playing phase renders the game without auto-skipping', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    // The legacy game should be mounted — onDone must NOT have been called on mount
    expect(screen.getByTestId('legacy-game')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('normal game completion: legacy onComplete → Finished results → Continue calls onDone(value, false)', async () => {
    const onDone = vi.fn();
    render(
      <Provider store={makeStore()}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          participants={PARTICIPANTS}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => { vi.runAllTimers(); });

    // The legacy wrapper should have mounted and provided its onComplete callback
    expect(capturedLegacyOnComplete).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();

    // Simulate the legacy game reporting a final score
    await act(async () => {
      capturedLegacyOnComplete!({ value: 42 });
    });

    // The "Finished!" results screen should now appear (not "Exited Early")
    expect(screen.getByText('🏁 Finished!')).toBeTruthy();
    // onDone must NOT have fired yet — player must click Continue
    expect(onDone).not.toHaveBeenCalled();

    // Click Continue to confirm
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    });

    // onDone fired with the reported score and partial=false
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(42, false);
  });
});
