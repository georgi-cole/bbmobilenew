// Integration tests for the challenge flow dispatch.
//
// Validates:
//  1. Dispatching setPhase('hoh_comp') causes GameScreen's useEffect to dispatch
//     startChallenge, populating state.challenge.pending.
//  2. MinigameHost is mounted in the DOM when challenge.pending is set.
//  3. Dispatching startChallenge directly populates challenge.pending with a
//     GameRegistryEntry and leaves challenge.history unchanged until completed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import challengeReducer, { startChallenge } from '../../src/store/challengeSlice';
import settingsReducer from '../../src/store/settingsSlice';
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

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      settings: settingsReducer,
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
