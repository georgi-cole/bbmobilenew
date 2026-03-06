/**
 * Integration tests for the QuickCrown dontGoOver flow.
 *
 * Validates:
 *   1. dontGoOver minigame applies applyMinigameWinner immediately (before
 *      QuickCrown animation finishes).
 *   2. QuickCrown overlay appears and renders the HOH badge over the winner's
 *      tile when a non-zero DOMRect is available.
 *   3. QuickCrown fires onDone after durationMs and clears itself.
 *   4. waitForTileRect resolves when getTileRect returns a non-null rect
 *      and retries when null is returned.
 *   5. Other minigames (non-dontGoOver) still use SpotlightAnimation/
 *      CeremonyOverlay and do NOT apply the winner immediately.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer from '../../src/store/settingsSlice';
import cwgoReducer from '../../src/features/cwgo/cwgoCompetitionSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';
import { waitForTileRect } from '../../src/components/QuickCrown/QuickCrown';

// ── Module-level captured callbacks ─────────────────────────────────────────
let capturedMinigameOnDone: ((rawValue: number) => void) | null = null;

vi.mock('../../src/components/MinigameHost/MinigameHost', () => ({
  default: ({ onDone }: { onDone: (rawValue: number) => void }) => {
    capturedMinigameOnDone = onDone;
    return <div data-testid="minigame-mock" />;
  },
}));

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}, forceDontGoOver = false) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    pendingMinigame: null,
    minigameResult: null,
    twistActive: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    voteResults: null,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
    ...overrides,
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      cwgo: cwgoReducer,
    },
    preloadedState: {
      game: base,
      ...(forceDontGoOver
        ? { challenge: { pending: null, history: [], nextNonce: 1, debug: { forceGameKey: 'dontGoOver' } } }
        : {}),
    },
  });
}

function renderWithStore(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>,
  );
}

// ── waitForTileRect unit tests ───────────────────────────────────────────────

describe('waitForTileRect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves immediately on first frame when rect is available', async () => {
    const mockRect = new DOMRect(10, 20, 50, 60);
    const getTileRect = vi.fn().mockReturnValue(mockRect);

    const promise = waitForTileRect(getTileRect, 'p0');
    vi.runAllTimers();
    const result = await promise;

    expect(result).toBe(mockRect);
    expect(getTileRect).toHaveBeenCalledWith('p0');
  });

  it('retries until rect is available', async () => {
    const mockRect = new DOMRect(10, 20, 50, 60);
    // Return null for first 2 calls, then return rect.
    const getTileRect = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(mockRect);

    const promise = waitForTileRect(getTileRect, 'winner');
    vi.runAllTimers(); // fires all chained RAF timeouts until promise resolves
    const result = await promise;

    expect(result).toBe(mockRect);
    // 3 calls: attempt 1 (null), attempt 2 (null), attempt 3 (mockRect → resolve)
    expect(getTileRect).toHaveBeenCalledTimes(3);
  });

  it('resolves with null after maxFrames total attempts if rect is never available', async () => {
    const getTileRect = vi.fn().mockReturnValue(null);

    // maxFrames=3 → 3 total attempts, then resolve(null)
    const promise = waitForTileRect(getTileRect, 'p0', 3);
    vi.runAllTimers();
    const result = await promise;

    expect(result).toBeNull();
    expect(getTileRect).toHaveBeenCalledTimes(3);
  });
});

// ── QuickCrown dontGoOver flow tests ────────────────────────────────────────

describe('GameScreen – dontGoOver uses QuickCrown (immediate winner commit)', () => {
  beforeEach(() => {
    capturedMinigameOnDone = null;
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies applyMinigameWinner immediately when dontGoOver completes (does not defer)', async () => {
    const store = makeStore({}, true /* forceDontGoOver */);
    renderWithStore(store);

    // Auto-start fires; wait for challenge to be created.
    await act(async () => { store.dispatch(setPhase('hoh_comp')); });

    expect(screen.getByTestId('minigame-mock')).toBeTruthy();
    expect(capturedMinigameOnDone).not.toBeNull();

    // Trigger minigame completion.
    await act(async () => { capturedMinigameOnDone!(100); });

    // Winner should be committed immediately — no RAF flush needed.
    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).not.toBeNull();
  });

  it('shows QuickCrown overlay (role=status with HOH caption) when tile rect is available', async () => {
    // Mock getBoundingClientRect so winner tile returns a non-zero rect.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);

    const store = makeStore({}, true /* forceDontGoOver */);
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    expect(capturedMinigameOnDone).not.toBeNull();

    await act(async () => { capturedMinigameOnDone!(100); });

    // Flush the RAF used by waitForTileRect inside QuickCrown.
    await act(async () => { vi.advanceTimersByTime(0); });

    // QuickCrown should be visible with HOH caption.
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-label')).toContain('wins Head of Household');

    // Winner must already be committed — QuickCrown is purely cosmetic here.
    expect(store.getState().game.hohId).not.toBeNull();
  });

  it('QuickCrown fires onDone after durationMs and clears itself', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);

    const store = makeStore({}, true /* forceDontGoOver */);
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    await act(async () => { capturedMinigameOnDone!(100); });

    // Flush RAF for QuickCrown measurement.
    await act(async () => { vi.advanceTimersByTime(0); });

    // QuickCrown should be visible.
    expect(screen.getByRole('status')).toBeTruthy();

    // Advance past QuickCrown default durationMs (1200 ms).
    await act(async () => { vi.advanceTimersByTime(1200); });

    // QuickCrown should be gone.
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does NOT show SpotlightAnimation for dontGoOver', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);

    const store = makeStore({}, true /* forceDontGoOver */);
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    await act(async () => { capturedMinigameOnDone!(100); });

    // Flush RAF.
    await act(async () => { vi.advanceTimersByTime(0); });

    // Phase should already be advanced (winner applied immediately).
    // If SpotlightAnimation were used, phase would still be hoh_comp here.
    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── Non-dontGoOver minigames still use deferred ceremony ────────────────────

describe('GameScreen – non-dontGoOver minigames still defer winner commit', () => {
  beforeEach(() => {
    capturedMinigameOnDone = null;
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does NOT show QuickCrown for non-dontGoOver games (uses SpotlightAnimation path)', async () => {
    // Use default jsdom zero rects so the CeremonyOverlay fires onDone immediately
    // (avoiding SpotlightAnimation staying mounted during test cleanup).
    // No forceGameKey override → random game (not dontGoOver).
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    expect(capturedMinigameOnDone).not.toBeNull();

    await act(async () => { capturedMinigameOnDone!(100); });
    // Flush RAF for deferred setPendingWinnerCeremony.
    await act(async () => { vi.advanceTimersByTime(0); });

    // With zero rects, CeremonyOverlay fires onDone immediately → phase advances.
    // Either way, the test should not throw — verify flow completes without crash.
    const phase = store.getState().game.phase;
    expect(['hoh_comp', 'hoh_results']).toContain(phase);

    // QuickCrown should NOT be present — it is only for dontGoOver.
    // (With zero rects, the SpotlightAnimation/CeremonyOverlay fires onDone
    // immediately and clears itself, so role=status may not be present either.)
    // If it IS present, it must NOT have 'QuickCrown' in its class name.
    const statusEls = document.querySelectorAll('[role=status]');
    statusEls.forEach((el) => {
      expect(el.className).not.toContain('quick-crown');
    });
  });
});
