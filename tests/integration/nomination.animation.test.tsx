// Integration tests for the CeremonyOverlay nomination wiring in GameScreen.
//
// Validates:
//  1. After the human LOH selects nominees, the CeremonyOverlay overlay
//     appears (game state is NOT yet committed — awaitingNominations remains true).
//  2. After the animation's onDone fires, commitNominees is dispatched and
//     the game state reflects the two nominated players.
//  3. A fallback path: if nominees array is empty the overlay is not shown.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import profilesReducer from '../../src/store/profilesSlice';
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
  default: (props: { publicSaveReveal?: { savedId: string } | null }) => (
    <div data-testid="tv-zone">
      {props.publicSaveReveal ? (
        <div data-testid="public-save-tv" data-saved-id={props.publicSaveReveal.savedId} />
      ) : null}
    </div>
  ),
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
    lohId: 'p0',
    prevHohId: null,
    nomineeIds: [],
    nominationContext: null,
    posWinnerId: null,
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
      profiles: profilesReducer,
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
      <MemoryRouter initialEntries={['/?qa=1']}>
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
    localStorage.clear();
    (window as Window & { __E2E__?: boolean }).__E2E__ = true;
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
    delete (window as Window & { __E2E__?: boolean }).__E2E__;
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows the CeremonyOverlay after nominees are confirmed', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play Nomination Animation/i }));
    });

    // The CeremonyOverlay should now be visible with a status role
    const animStatus = screen.getByRole('status');
    expect(animStatus).toBeTruthy();
    expect(animStatus.getAttribute('aria-label')).toContain('Nomination ceremony');

    // Game state should NOT yet be committed (animation hasn't completed)
    expect(store.getState().game.awaitingNominations).toBe(true);
    expect(store.getState().game.nomineeIds).toHaveLength(0);
  });

  it('adds pre-ceremony LOH, danger, and locked warning outlines while nominations are pending', () => {
    const store = makeStore({
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p5',
    });
    renderWithStore(store);

    expect(document.querySelectorAll('[data-nomination-ceremony-state="loh"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-nomination-ceremony-state="locked"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-nomination-ceremony-state="danger"]')).toHaveLength(4);
  });

  it('commits nominees to game state after the animation completes (onDone)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play Nomination Animation/i }));
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

  it('does not show NominationAnimator when human is not LOH', () => {
    // p1 is LOH (not the human player p0)
    const store = makeStore({ lohId: 'p1' });
    renderWithStore(store);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Nomination Ceremony')).toBeNull();
  });

  it('shows CeremonyOverlay for AI LOH nominations (nominees already in store)', async () => {
    // AI LOH (p1) has already nominated p2 and p3 — awaitingNominations is false.
    // GameScreen should detect this and trigger the animation automatically.
    const store = makeStore({
      lohId: 'p1',
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

  it('shows role pills for LOH nominees and the auto-third nominee', async () => {
    const store = makeStore({
      lohId: 'p1',
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

    expect(screen.getAllByText('LOH Nominee')).toHaveLength(2);
    expect(screen.getByText('Last in LOH Comp')).toBeTruthy();
  });

  it('lights the LOH and sends LOH nominee badges from the LOH tile while the auto nominee appears on its own', async () => {
    const store = makeStore({
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p4',
    });
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play Nomination Animation/i }));
    });

    expect(screen.getByRole('status')).toBeTruthy();
    expect(document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="gold"]')).toHaveLength(1);
    expect(document.querySelectorAll('.ceremony-overlay__glow[data-ceremony-tone="danger"]')).toHaveLength(3);
    expect(document.querySelectorAll('.ceremony-overlay__badge[data-badge-origin="tile"]')).toHaveLength(2);
    expect(document.querySelectorAll('.ceremony-overlay__badge[data-badge-origin="center"]')).toHaveLength(1);
    expect(
      document.querySelectorAll('.ceremony-overlay__badge img[src*="nomination_badge.png"]'),
    ).toHaveLength(3);
  });

  it('uses shorter nomination pills on mobile-sized viewports', async () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 560px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const store = makeStore({
        lohId: 'p1',
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

      expect(screen.getAllByText('NOMINEE')).toHaveLength(2);
      expect(screen.getByText('LAST PLACE')).toBeTruthy();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('stagger-guards adjacent mobile nomination pills to avoid overlap', async () => {
    const TILE_TOP = 100;
    const TILE_WIDTH = 60;
    const TILE_HEIGHT = 80;
    const PLAYER_TWO_LEFT = 44;
    const PLAYER_THREE_LEFT = 102;
    const PLAYER_FOUR_LEFT = 160;
    const originalMatchMedia = window.matchMedia;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const title = this.getAttribute('title');
      const left =
        title === 'Player 2'
          ? PLAYER_TWO_LEFT
          : title === 'Player 3'
            ? PLAYER_THREE_LEFT
            : title === 'Player 4'
              ? PLAYER_FOUR_LEFT
              : PLAYER_TWO_LEFT;
      return {
        x: left, y: TILE_TOP, width: TILE_WIDTH, height: TILE_HEIGHT,
        top: TILE_TOP,
        left,
        bottom: TILE_TOP + TILE_HEIGHT,
        right: left + TILE_WIDTH,
        toJSON: () => ({}),
      } as DOMRect;
    });

    try {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 560px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const store = makeStore({
        lohId: 'p1',
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

      const labelTops = Array.from(
        document.querySelectorAll<HTMLElement>('.ceremony-overlay__tile-label'),
      ).map((node) => node.style.top);

      expect(new Set(labelTops).size).toBeGreaterThan(1);
    } finally {
      window.matchMedia = originalMatchMedia;
      rectSpy.mockRestore();
    }
  });

  it('does not include an auto-third nominee in the human animation when public mode is off', async () => {
    const store = makeStore({
      publicModeEnabled: false,
      lastHohCompFinisherId: 'p3',
    });
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play Nomination Animation/i }));
    });

    expect(document.querySelectorAll('.ceremony-overlay__glow')).toHaveLength(3);
    expect(screen.queryByText('Last in LOH Comp')).toBeNull();

    await act(async () => { vi.advanceTimersByTime(2800); });
    await act(async () => { vi.advanceTimersByTime(500); });

    expect(screen.queryByRole('status')).toBeNull();
    expect(store.getState().game.nomineeIds).toEqual(['p1', 'p2']);
  });

  it('shows human nomination role pills before commit when public mode adds an auto-third nominee', async () => {
    const store = makeStore({
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p3',
    });
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Play Nomination Animation/i }));
    });

    expect(screen.getAllByText('LOH Nominee')).toHaveLength(2);
    expect(screen.getByText('Last in LOH Comp')).toBeTruthy();
    expect(
      screen.getByText('🎯 Nominations are set — including the LOH comp last-place finisher'),
    ).toBeTruthy();

    expect(store.getState().game.nominationContext).toBeNull();
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('hides the floating action bar while the public save reveal is active', async () => {
    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p1',
      nomineeIds: ['p2', 'p3', 'p4'],
      awaitingNominations: false,
      awaitingPublicSave: true,
      publicModeEnabled: true,
    });
    renderWithStore(store);

    await act(async () => {});

    expect(screen.getByTestId('public-save-tv')).toHaveAttribute('data-saved-id', 'p2');
    expect(screen.queryByRole('toolbar', { name: 'Game actions' })).toBeNull();
  });

  it('does not double-animate AI LOH nominees after the animation completes', async () => {
    const store = makeStore({
      lohId: 'p1',
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

  it('does not replay AI LOH nominees after GameScreen remounts', async () => {
    const store = makeStore({
      lohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingNominations: false,
    });
    const firstRender = renderWithStore(store);

    await act(async () => {});

    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => { vi.advanceTimersByTime(2800); });
    await act(async () => { vi.advanceTimersByTime(500); });

    expect(screen.queryByRole('status')).toBeNull();

    firstRender.unmount();

    renderWithStore(store);
    await act(async () => {});

    expect(screen.queryByRole('status')).toBeNull();
    expect(store.getState().game.nomineeIds).toEqual(['p2', 'p3']);
  });
});
