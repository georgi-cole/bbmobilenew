// Integration tests for the CeremonyOverlay nomination wiring in GameScreen.
//
// Validates:
//  1. After the human HOH selects nominees, the CeremonyOverlay overlay
//     appears (game state is NOT yet committed — awaitingNominations remains true).
//  2. After the animation's onDone fires, commitNominees is dispatched and
//     the game state reflects the two nominated players.
//  3. A fallback path: if nominees array is empty the overlay is not shown.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────

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
    phase: 'nomination_results',
    seed: 42,
    hohId: 'p0',
    prevHohId: null,
    nomineeIds: [],
    nominationContext: null,
    povWinnerId: null,
    publicModeEnabled: false,
    replacementNeeded: false,
    awaitingNominations: true,
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
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    pendingEviction: null,
    povSavedId: null,
    lastHohCompFinisherId: null,
    publicSavedNomineeId: null,
    awaitingPublicSave: false,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    specialVeto: {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
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

// CeremonyOverlay default durationMs = 2800, plus 350ms exit transition.
// Total timeline: ~3150ms from mount to onDone.

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NominationAnimator wiring in GameScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // CeremonyOverlay uses getTileRect → document.querySelector + getBoundingClientRect.
    // In jsdom, getBoundingClientRect returns zero rects → overlay fires onDone immediately.
    // Mock it to return non-zero rects so the overlay actually renders.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the CeremonyOverlay after nominees are confirmed', async () => {
    const store = makeStore();
    renderWithStore(store);

    // Multi-select modal should be visible (human is HOH, awaitingNominations true)
    expect(screen.getByText('Nomination Ceremony')).toBeTruthy();

    // Select two eligible players (p1 and p2) and confirm.
    // getAllByText because the houseguest grid also renders player names.
    await act(async () => {
      fireEvent.click(screen.getAllByText('Player 1')[0]);
      fireEvent.click(screen.getAllByText('Player 2')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Nominees'));
    });

    // The stinger plays and then onConfirm fires — advance past it (default 900 ms)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // The CeremonyOverlay should now be visible with a status role
    const animStatus = screen.getByRole('status');
    expect(animStatus).toBeTruthy();
    expect(animStatus.getAttribute('aria-label')).toContain('Nomination ceremony');

    // Game state should NOT yet be committed (animation hasn't completed)
    expect(store.getState().game.awaitingNominations).toBe(true);
    expect(store.getState().game.nomineeIds).toHaveLength(0);
  });

  it('commits nominees to game state after the animation completes (onDone)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getAllByText('Player 1')[0]);
      fireEvent.click(screen.getAllByText('Player 2')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Nominees'));
    });

    // Advance past stinger (default 900 ms)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // After the stinger, nominations should not yet be committed.
    let state = store.getState().game;
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);
    expect(state.players.find((p) => p.id === 'p1')?.status).not.toBe('nominated');
    expect(state.players.find((p) => p.id === 'p2')?.status).not.toBe('nominated');

    // Advance through the CeremonyOverlay lifecycle:
    // durationMs=2800 (main visible phase) + 350ms (exit transition) = 3150ms total
    // Advance in steps to verify state at intermediate points.

    // At 1500ms: still in animation (badge phases progressing)
    await act(async () => { vi.advanceTimersByTime(1500); });
    state = store.getState().game;
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);

    // At 2800ms total: exit begins (durationMs reached)
    await act(async () => { vi.advanceTimersByTime(1300); });
    state = store.getState().game;
    // May or may not have committed yet (exit transition in progress)

    // At 3150ms total: exit transition done → onDone fires → commitNominees dispatched
    await act(async () => { vi.advanceTimersByTime(500); });

    state = store.getState().game;
    expect(state.awaitingNominations).toBe(false);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.players.find((p) => p.id === 'p1')?.status).toBe('nominated');
    expect(state.players.find((p) => p.id === 'p2')?.status).toBe('nominated');
  });

  it('does not show NominationAnimator when human is not HOH', () => {
    // p1 is HOH (not the human player p0)
    const store = makeStore({ hohId: 'p1' });
    renderWithStore(store);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Nomination Ceremony')).toBeNull();
  });

  it('shows CeremonyOverlay for AI HOH nominations (nominees already in store)', async () => {
    // AI HOH (p1) has already nominated p2 and p3 — awaitingNominations is false.
    // GameScreen should detect this and trigger the animation automatically.
    const store = makeStore({
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingNominations: false,
    });
    renderWithStore(store);

    // The AI nomination detection effect should fire and show the overlay.
    await act(async () => {});

    const animStatus = screen.getByRole('status');
    expect(animStatus).toBeTruthy();
    expect(animStatus.getAttribute('aria-label')).toContain('Nomination ceremony');

    // Store state is already committed (AI nominated directly); game retains nominees.
    expect(store.getState().game.nomineeIds).toContain('p2');
    expect(store.getState().game.nomineeIds).toContain('p3');
  });

  it('shows role pills for HOH nominees and the auto-third nominee', async () => {
    const store = makeStore({
      hohId: 'p1',
      nomineeIds: ['p2', 'p3', 'p4'],
      awaitingNominations: false,
      nominationContext: {
        hohNomineeIds: ['p2', 'p3'],
        autoNomineeId: 'p4',
        publicSaveApplied: false,
      },
    });
    renderWithStore(store);

    await act(async () => {});

    expect(screen.getAllByText('HOH Nominee')).toHaveLength(2);
    expect(screen.getByText('Last in HOH Comp')).toBeTruthy();
  });

  it('does not double-animate AI HOH nominees after the animation completes', async () => {
    const store = makeStore({
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingNominations: false,
    });
    renderWithStore(store);

    await act(async () => {});

    // Animation is visible.
    expect(screen.getByRole('status')).toBeTruthy();

    // Advance through full CeremonyOverlay lifecycle (durationMs=2800 + exit=350).
    await act(async () => { vi.advanceTimersByTime(2800); });
    await act(async () => { vi.advanceTimersByTime(500); });

    // Animation done — no duplicate overlay should appear.
    expect(screen.queryByRole('status')).toBeNull();

    // Nominees remain committed (commitNominees no-op when awaitingNominations=false).
    expect(store.getState().game.nomineeIds).toHaveLength(2);
  });
});
