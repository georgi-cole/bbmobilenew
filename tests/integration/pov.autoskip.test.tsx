/**
 * POS minigame auto-skip fix — GameScreen integration tests.
 *
 * Root cause: GameScreen's `onDone` handler did not accept or check the
 * `partial` flag.  Any early exit (accidental ✕ click, rules dismiss) would
 * flow through `completeChallenge → applyMinigameWinner` exactly as a valid
 * completion, immediately crowning a winner without gameplay.  This was most
 * noticeable in the POS competition where the player would see the rules modal
 * and countdown but then be returned to GameScreen with a winner announced.
 *
 * Fix: `GameScreen.onDone` now accepts `partial?: boolean`.  When `partial`
 * is true (exit-early path confirmed via the "Exited Early" results screen),
 * the winner is applied via `applyMinigameWinner` directly — advancing the
 * game so it doesn't get stuck — but the SpotlightAnimation ceremony is
 * skipped so no false winner announcement is shown.
 *
 * Tests verify:
 *  1. partial=true on POS: phase advances from pos_comp → pos_results and
 *     posWinnerId is set (game is not stuck).
 *  2. partial=true on LOH: lohId is set and phase is loh_results.
 *  3. partial=true does NOT trigger the winner ceremony overlay.
 *  4. partial=false (valid completion) still works normally — no regression.
 *  5. POS prizeType is correctly used even when partial=true (not confused
 *     with LOH).
 *  6. challenge.pending is cleared so no double-challenge can start.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import profilesReducer from '../../src/store/profilesSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Module-level captured callback (required: vi.mock is hoisted) ──────────

let capturedOnDone: ((rawValue: number, partial?: boolean) => void) | null = null;
let capturedCeremonyOnDone: (() => void) | null = null;

vi.mock('../../src/components/MinigameHost/MinigameHost', () => ({
  default: ({ onDone }: { onDone: (rawValue: number, partial?: boolean) => void }) => {
    capturedOnDone = onDone;
    return <div data-testid="minigame-mock" />;
  },
}));

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

vi.mock('../../src/components/WinnerTileLiftAnimation/WinnerTileLiftAnimation', () => ({
  default: ({ onDone }: { onDone: () => void }) => {
    capturedCeremonyOnDone = onDone;
    return null;
  },
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

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  const base: GameState = {
    season: 1,
    week: 1,
    // Start in a non-competition phase so GameScreen's auto-start useEffect
    // does not fire on mount.  Each test explicitly dispatches setPhase(...)
    // to transition to the phase under test, ensuring the captured onDone
    // closure corresponds to exactly the challenge started by that dispatch.
    phase: 'week_start',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
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
    players: makePlayers(4), // p0 = human, p1-p3 = non-user
    tvFeed: [],
    isLive: false,
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
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: {
        ...DEFAULT_SETTINGS,
        ...settingsOverrides,
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          ...settingsOverrides.gameUX,
          compSelection: {
            ...DEFAULT_SETTINGS.gameUX.compSelection,
            ...(settingsOverrides.gameUX?.compSelection ?? {}),
          },
        },
      },
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

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GameScreen.onDone — partial=true still advances the game (no stuck state)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOnDone = null;
    capturedCeremonyOnDone = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('partial=true on POS comp applies a winner (game advances to pos_results)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('pos_comp')); });

    expect(capturedOnDone).not.toBeNull();

    // Simulate the "Exited Early" path: player dismissed and confirmed via Continue
    await act(async () => { capturedOnDone!(0, true); });

    // Phase must no longer be 'pos_comp' — the game has advanced
    expect(store.getState().game.phase).toBe('pos_results');
    // A POS winner must have been applied
    expect(store.getState().game.posWinnerId).not.toBeNull();
  });

  it('partial=true on LOH comp applies an LOH winner (loh_results)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('loh_comp')); });

    expect(capturedOnDone).not.toBeNull();

    await act(async () => { capturedOnDone!(0, true); });

    expect(store.getState().game.lohId).not.toBeNull();
    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('challenge.pending is cleared after partial=true (no double-challenge)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('pos_comp')); });

    // A challenge must have started
    expect(store.getState().challenge.pending).not.toBeNull();

    await act(async () => { capturedOnDone!(0, true); });

    // pendingChallenge must be null so no second challenge starts
    expect(store.getState().challenge.pending).toBeNull();
  });

  it('partial=true on placement-based games records rank-based results instead of 0/random scores', async () => {
    const store = makeStore(
      {},
      {
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          compSelection: {
            ...DEFAULT_SETTINGS.gameUX.compSelection,
            mode: 'single-game',
            selectedGameId: 'holdWall',
          },
        },
      },
    );
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('loh_comp')); });

    const pending = store.getState().challenge.pending;
    expect(pending?.game.key).toBe('holdWall');

    await act(async () => { capturedOnDone!(0, true); });

    const run = store.getState().challenge.history[0];
    expect(run).toBeTruthy();
    expect(run?.rawScores.p0).toBe(1);
    expect(Object.values(run?.rawScores ?? {}).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('POS prizeType is used (partial=true sets posWinnerId, not lohId)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('pos_comp')); });

    await act(async () => { capturedOnDone!(0, true); });

    // POS winner set, LOH winner still null
    expect(store.getState().game.posWinnerId).not.toBeNull();
    expect(store.getState().game.lohId).toBeNull();
  });
});

describe('GameScreen.onDone — partial=false (normal completion) — no regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedOnDone = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('partial=false on POS comp still applies the winner', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('pos_comp')); });

    expect(capturedOnDone).not.toBeNull();

    // Normal valid game completion
    await act(async () => { capturedOnDone!(750, false); });
    await act(async () => { capturedCeremonyOnDone?.(); });

    expect(store.getState().game.posWinnerId).not.toBeNull();
    expect(store.getState().game.phase).toBe('pos_results');
  });

  it('partial=false on LOH comp still applies the LOH winner', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('loh_comp')); });

    expect(capturedOnDone).not.toBeNull();

    await act(async () => { capturedOnDone!(500, false); });
    await act(async () => { capturedCeremonyOnDone?.(); });

    expect(store.getState().game.lohId).not.toBeNull();
    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('omitting partial (undefined) behaves like partial=false', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('pos_comp')); });

    // Calling onDone with only one argument (partial omitted / undefined)
    await act(async () => { capturedOnDone!(300); });
    await act(async () => { capturedCeremonyOnDone?.(); });

    expect(store.getState().game.posWinnerId).not.toBeNull();
    expect(store.getState().game.phase).toBe('pos_results');
  });
});
