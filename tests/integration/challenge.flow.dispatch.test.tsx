// Integration tests for the challenge flow dispatch.
//
// Validates:
//  1. Dispatching setPhase('hoh_comp') causes GameScreen's useEffect to dispatch
//     startChallenge, populating state.challenge.pending.
//  2. MinigameHost is mounted in the DOM when challenge.pending is set.
//  3. Dispatching startChallenge directly populates challenge.pending with a
//     GameRegistryEntry and leaves challenge.history unchanged until completed.
//  4. startChallenge respects compSelection settings (single-game, user-selection,
//     category-only, unique, retired modes).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import challengeReducer, { startChallenge, recordRun, setPendingChallenge } from '../../src/store/challengeSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../../src/store/settingsSlice';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────

// LegacyMinigameWrapper uses dynamic imports; replace with a stub that does
// nothing so MinigameHost can mount without a real minigame bundle.
vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

// TvZone requires useNavigate; keep it simple.
vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const REDUCERS = {
  game: gameReducer,
  challenge: challengeReducer,
  settings: settingsReducer,
} as const;

function makeStore() {
  return configureStore({ reducer: REDUCERS });
}

/** Create a store with custom settings.gameUX.compSelection preloaded. */
function makeStoreWithCompSelection(
  compSelection: Partial<typeof DEFAULT_SETTINGS.gameUX.compSelection>,
) {
  return configureStore({
    reducer: REDUCERS,
    preloadedState: {
      settings: {
        ...DEFAULT_SETTINGS,
        gameUX: {
          ...DEFAULT_SETTINGS.gameUX,
          compSelection: {
            ...DEFAULT_SETTINGS.gameUX.compSelection,
            ...compSelection,
          },
        },
      },
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;
// RTK's configureStore dispatch accepts thunks via built-in middleware.
// The cast below is needed because TypeScript infers a narrower dispatch type.
const dispatchThunk = (store: TestStore, thunk: Parameters<TestStore['dispatch']>[0]) =>
  store.dispatch(thunk);

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

describe('challenge flow – phase transition dispatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('populates challenge.pending when phase transitions to hoh_comp', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('hoh_comp'));
    });

    const state = store.getState();
    expect(state.challenge.pending).not.toBeNull();
    expect(state.challenge.pending?.participants.length).toBeGreaterThan(0);
    expect(state.challenge.pending?.game).toBeDefined();
  });

  it('populates challenge.pending when phase transitions to pov_comp', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('pov_comp'));
    });

    const state = store.getState();
    expect(state.challenge.pending).not.toBeNull();
    expect(state.challenge.pending?.game.key).toBeTruthy();
  });

  it('does not dispatch a second challenge if one is already pending', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('hoh_comp'));
    });

    const firstId = store.getState().challenge.pending?.id;

    await act(async () => {
      // Re-render won't re-dispatch because pendingChallenge guard is active.
      store.dispatch(setPhase('hoh_comp'));
    });

    expect(store.getState().challenge.pending?.id).toBe(firstId);
  });

  it('renders MinigameHost (role=dialog) when challenge.pending is set', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('hoh_comp'));
    });

    // MinigameHost renders with role="dialog" and an aria-label containing "minigame".
    // (MinigameRules inside it also has role="dialog", so use getAllByRole.)
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    expect(dialogs.some((d) => d.classList.contains('minigame-host'))).toBe(true);
  });
});

describe('challenge flow – startChallenge thunk', () => {
  it('populates challenge.pending with a GameRegistryEntry', () => {
    const store = makeStore();
    const seed = 42;
    const participants = ['p1', 'p2', 'p3'];

    dispatchThunk(store, startChallenge(seed, participants));

    const state = store.getState();
    expect(state.challenge.pending).not.toBeNull();
    expect(state.challenge.pending?.game).toBeDefined();
    expect(typeof state.challenge.pending?.game.key).toBe('string');
    expect(state.challenge.pending?.game.title).toBeTruthy();
    expect(state.challenge.pending?.participants).toEqual(participants);
    expect(state.challenge.pending?.phase).toBe('rules');
  });

  it('leaves challenge.history empty until completeChallenge is called', () => {
    const store = makeStore();

    dispatchThunk(store, startChallenge(99, ['p1', 'p2']));

    expect(store.getState().challenge.history).toHaveLength(0);
  });
});

// ── compSelection-aware selection ─────────────────────────────────────────

describe('startChallenge – compSelection modes', () => {
  it('single-game: uses the game matching selectedGameId', () => {
    const store = makeStoreWithCompSelection({
      mode: 'single-game',
      selectedGameId: 'holdWall',
      enabledIds: [],
    });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    expect(pending?.game.key).toBe('holdWall');
  });

  it('single-game: falls back to random when selectedGameId is unknown', () => {
    const store = makeStoreWithCompSelection({
      mode: 'single-game',
      selectedGameId: 'nonExistentGame',
      enabledIds: [],
    });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    // Should still select some valid game
    expect(typeof pending?.game.key).toBe('string');
    expect(pending?.game.key).toBeTruthy();
  });

  it('user-selection: picks deterministically from selectedGameIds pool', () => {
    const store = makeStoreWithCompSelection({
      mode: 'user-selection',
      selectedGameIds: ['countHouse', 'triviaPulse', 'quickTap'],
      enabledIds: [],
    });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    expect(['countHouse', 'triviaPulse', 'quickTap']).toContain(pending?.game.key);
  });

  it('user-selection: falls back to random when selectedGameIds is empty', () => {
    const store = makeStoreWithCompSelection({
      mode: 'user-selection',
      selectedGameIds: [],
      enabledIds: [],
    });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    expect(typeof pending?.game.key).toBe('string');
  });

  it('arcade-only: selects a game with category arcade', () => {
    const store = makeStoreWithCompSelection({ mode: 'arcade-only', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending?.game.category).toBe('arcade');
  });

  it('trivia-only: selects a game with category trivia', () => {
    const store = makeStoreWithCompSelection({ mode: 'trivia-only', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending?.game.category).toBe('trivia');
  });

  it('endurance-only: selects a game with category endurance', () => {
    const store = makeStoreWithCompSelection({ mode: 'endurance-only', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending?.game.category).toBe('endurance');
  });

  it('logic-only: selects a game with category logic', () => {
    const store = makeStoreWithCompSelection({ mode: 'logic-only', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending?.game.category).toBe('logic');
  });

  it('unique: does not repeat a recently used game (when pool allows)', () => {
    // Seed the challenge history with a specific game key so `unique` excludes it.
    const store = makeStoreWithCompSelection({ mode: 'unique', enabledIds: [] });

    // First challenge
    dispatchThunk(store, startChallenge(1, ['p1', 'p2']));
    const firstKey = store.getState().challenge.pending?.game.key ?? '';

    // Manually record the first run so history is populated.
    store.dispatch(
      recordRun({
        id: 'run-1',
        gameKey: firstKey,
        seed: 1,
        participants: ['p1', 'p2'],
        rawScores: {},
        canonicalScores: {},
        winnerId: 'p1',
        timestamp: Date.now(),
        authoritative: false,
      }),
    );

    // Clear pending so we can start a new challenge.
    store.dispatch(setPendingChallenge(null));

    // Second challenge — unique mode should avoid the first game key
    // (only guaranteed when the registry has more than one non-retired game,
    //  which it does; the pool has many entries).
    dispatchThunk(store, startChallenge(2, ['p1', 'p2']));
    const secondKey = store.getState().challenge.pending?.game.key;

    // There are many games in the registry, so the second pick should differ.
    expect(secondKey).not.toBe(firstKey);
  });

  it('random-games: falls back to the existing random selection', () => {
    const store = makeStoreWithCompSelection({ mode: 'random-games', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    expect(typeof pending?.game.key).toBe('string');
  });

  it('debug forceGameKey overrides compSelection mode', () => {
    const store = makeStoreWithCompSelection({
      mode: 'single-game',
      selectedGameId: 'holdWall',
      enabledIds: [],
    });

    // Debug override should win over compSelection.
    dispatchThunk(store, startChallenge(42, ['p1', 'p2'], { forceGameKey: 'quickTap' }));

    const pending = store.getState().challenge.pending;
    expect(pending?.game.key).toBe('quickTap');
  });
});
