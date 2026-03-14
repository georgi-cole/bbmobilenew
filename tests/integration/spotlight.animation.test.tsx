// Integration and unit tests for CeremonyOverlay and the
// MinigameHost → CeremonyOverlay → store-mutation deferred flow in GameScreen.
//
// Validates:
//   1. CeremonyOverlay fires onDone after durationMs when tiles have valid rects (fake timers).
//   2. CeremonyOverlay fires onDone immediately when tile rects are null/zero (fallback).
//   3. GameScreen defers applyMinigameWinner until CeremonyOverlay completes
//      (when getBoundingClientRect returns valid dimensions).
//   4. GameScreen commits immediately when DOMRect is unavailable (headless fallback).
//   5. SPOTLIGHT_SKIP / shouldSkipSpotlight correctly includes known skip keys including blackjackTournament.

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
import type { GameState, Player } from '../../src/types';
import CeremonyOverlay from '../../src/components/CeremonyOverlay/CeremonyOverlay';
import GameScreen from '../../src/screens/GameScreen/GameScreen';
import { SPOTLIGHT_SKIP, shouldSkipSpotlight } from '../../src/screens/GameScreen/spotlightUtils';

// ── Module-level captured callbacks ────────────────────────────────────────
// vi.mock is hoisted so we capture MinigameHost's onDone via a module-level ref.
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

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
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
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
    },
    preloadedState: { game: { ...base, ...overrides } },
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

// ── CeremonyOverlay unit tests ────────────────────────────────────────────

describe('CeremonyOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders caption and dim layer when tiles have valid rects', async () => {
    const rect = new DOMRect(50, 100, 60, 80);
    const onDone = vi.fn();
    render(
      <CeremonyOverlay
        tiles={[{ rect, badge: '👑', badgeStart: 'center' }]}
        caption="Alice wins Head of Household!"
        onDone={onDone}
        durationMs={1000}
      />,
    );
    expect(screen.getByText('Alice wins Head of Household!')).toBeTruthy();
  });

  it('fires onDone after durationMs (+ exit delay) when tiles are valid', async () => {
    const rect = new DOMRect(50, 100, 60, 80);
    const onDone = vi.fn();
    render(
      <CeremonyOverlay
        tiles={[{ rect, badge: '👑', badgeStart: 'center' }]}
        caption="Alice wins Head of Household!"
        onDone={onDone}
        durationMs={1000}
      />,
    );

    expect(onDone).not.toHaveBeenCalled();

    // Advance past durationMs — visibility timer fires, exit animation begins.
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onDone).not.toHaveBeenCalled(); // exit animation still in progress

    // Advance past the 350 ms exit transition.
    await act(async () => { vi.advanceTimersByTime(350 + 50); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fires onDone immediately and renders nothing when all tile rects are null', async () => {
    const onDone = vi.fn();
    const { container } = render(
      <CeremonyOverlay
        tiles={[{ rect: null, badge: '👑' }]}
        caption="Alice wins Head of Household!"
        onDone={onDone}
      />,
    );

    // Run pending microtasks / effects.
    await act(async () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
    // Component renders null — container is empty.
    expect(container.firstChild).toBeNull();
  });

  it('fires onDone immediately when tile rects have zero dimensions (headless / jsdom)', async () => {
    const onDone = vi.fn();
    const zeroRect = new DOMRect(0, 0, 0, 0);
    render(
      <CeremonyOverlay
        tiles={[{ rect: zeroRect, badge: '🛡️' }]}
        caption="Bob wins Power of Veto!"
        onDone={onDone}
      />,
    );

    await act(async () => {});
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

// ── GameScreen × CeremonyOverlay integration tests ────────────────────────

describe('GameScreen – CeremonyOverlay defers HOH/POV store mutations', () => {
  beforeEach(() => {
    capturedMinigameOnDone = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('commits applyMinigameWinner immediately when DOMRects are unavailable (defensive fallback)', async () => {
    // jsdom returns zero-sized rects by default → defensive fallback path.
    const store = makeStore();
    renderWithStore(store);

    // Start HOH comp and wait for challenge to be created.
    await act(async () => { store.dispatch(setPhase('hoh_comp')); });

    // MinigameHost should be mounted (mock captures onDone).
    expect(screen.getByTestId('minigame-mock')).toBeTruthy();
    expect(capturedMinigameOnDone).not.toBeNull();

    // Simulate minigame completion.
    await act(async () => { capturedMinigameOnDone!(100); });

    // Zero DOMRect → no animation → phase transitions immediately.
    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).not.toBeNull();
  });

  it('defers applyMinigameWinner until CeremonyOverlay completes when rects are valid', async () => {
    // Mock getBoundingClientRect to return a valid non-zero rect.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);

    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });

    expect(capturedMinigameOnDone).not.toBeNull();

    // Trigger minigame done.
    await act(async () => { capturedMinigameOnDone!(100); });

    // Valid DOMRect → CeremonyOverlay is showing → phase NOT yet committed.
    expect(store.getState().game.phase).toBe('hoh_comp');
    expect(store.getState().game.hohId).toBeNull();

    // CeremonyOverlay should be visible with appropriate aria label.
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-label')).toContain('wins Head of Household');

    // Advance past default durationMs (2800) + exit animation (350).
    await act(async () => { vi.advanceTimersByTime(2800); });
    await act(async () => { vi.advanceTimersByTime(350 + 50); });

    // Now the store mutation should have fired.
    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).not.toBeNull();
  });
});

// ── SPOTLIGHT_SKIP / shouldSkipSpotlight unit tests ───────────────────────

describe('SPOTLIGHT_SKIP and shouldSkipSpotlight', () => {
  it('SPOTLIGHT_SKIP is a Set containing all legacy skip keys', () => {
    expect(SPOTLIGHT_SKIP).toBeInstanceOf(Set);
    expect(SPOTLIGHT_SKIP.has('dontGoOver')).toBe(true);
    expect(SPOTLIGHT_SKIP.has('holdWall')).toBe(true);
    expect(SPOTLIGHT_SKIP.has('famousFigures')).toBe(true);
    expect(SPOTLIGHT_SKIP.has('biographyBlitz')).toBe(true);
    expect(SPOTLIGHT_SKIP.has('glass_bridge_brutal')).toBe(true);
  });

  it('SPOTLIGHT_SKIP includes blackjackTournament', () => {
    expect(SPOTLIGHT_SKIP.has('blackjackTournament')).toBe(true);
  });

  it('shouldSkipSpotlight returns true for all skip keys', () => {
    for (const key of SPOTLIGHT_SKIP) {
      expect(shouldSkipSpotlight(key)).toBe(true);
    }
  });

  it('shouldSkipSpotlight returns true for blackjackTournament', () => {
    expect(shouldSkipSpotlight('blackjackTournament')).toBe(true);
  });

  it('shouldSkipSpotlight returns false for minigames that use the spotlight', () => {
    expect(shouldSkipSpotlight('tapRace')).toBe(false);
    expect(shouldSkipSpotlight('castleRescue')).toBe(false);
    expect(shouldSkipSpotlight('silentSaboteur')).toBe(false);
    expect(shouldSkipSpotlight('')).toBe(false);
  });
});
