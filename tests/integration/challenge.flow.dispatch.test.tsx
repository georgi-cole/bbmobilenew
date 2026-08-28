// Integration tests for the challenge flow dispatch.
//
// Validates:
//  1. Dispatching setPhase('loh_comp') causes GameScreen's useEffect to dispatch
//     startChallenge, populating state.challenge.pending.
//  2. MinigameHost is mounted in the DOM when challenge.pending is set.
//  3. Dispatching startChallenge directly populates challenge.pending with a
//     GameRegistryEntry and leaves challenge.history unchanged until completed.
//  4. startChallenge respects compSelection settings (single-game, user-selection,
//     category-only, unique, retired modes).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { resetGame, setPhase } from '../../src/store/gameSlice';
import challengeReducer, { startChallenge, recordRun, setPendingChallenge } from '../../src/store/challengeSlice';
import profilesReducer, { type ProfilesState } from '../../src/store/profilesSlice';
import socialReducer from '../../src/social/socialSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import GameScreen from '../../src/screens/GameScreen/GameScreen';
import { I18nProvider } from '../../src/i18n';
import {
  getApprovedCompetitionGameKeys,
  getBracketPoolForContext,
  getClassicCampaignPoolForContext,
} from '../../src/ai/competition/bracketTemplate';
import { getPoolByFilter, supportsPlayerCount } from '../../src/minigames/registry';
import { createSurvivorRun } from '../../src/modes/survivorRun';

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
  profiles: profilesReducer,
  social: socialReducer,
  settings: settingsReducer,
  publicOpinion: publicOpinionReducer,
} as const;

function makeStore() {
  return configureStore({ reducer: REDUCERS });
}

function makeStoreWithGame(overrides: Partial<ReturnType<typeof gameReducer>>) {
  const initialGameState = gameReducer(undefined, { type: '@@INIT' });
  return configureStore({
    reducer: REDUCERS,
    preloadedState: {
      game: {
        ...initialGameState,
        ...overrides,
      },
    },
  });
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

function makeSurvivorStore() {
  return configureStore({
    reducer: REDUCERS,
    preloadedState: {
      game: createSurvivorRun(),
      profiles: {
        profiles: [],
        activeProfileId: null,
        isGuest: true,
      } satisfies ProfilesState,
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
      <I18nProvider>
        <MemoryRouter>
          <GameScreen />
        </MemoryRouter>
      </I18nProvider>
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

  it('populates challenge.pending when phase transitions to loh_comp', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('loh_comp'));
    });

    const state = store.getState();
    expect(state.challenge.pending).not.toBeNull();
    expect(state.challenge.pending?.participants.length).toBeGreaterThan(0);
    expect(state.challenge.pending?.game).toBeDefined();
  });

  it('populates challenge.pending when phase transitions to pos_comp', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('pos_comp'));
    });

    const state = store.getState();
    expect(state.challenge.pending).not.toBeNull();
    expect(state.challenge.pending?.game.key).toBeTruthy();
  });

  it('does not dispatch a second challenge if one is already pending', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('loh_comp'));
    });

    const firstId = store.getState().challenge.pending?.id;

    await act(async () => {
      // Re-render won't re-dispatch because pendingChallenge guard is active.
      store.dispatch(setPhase('loh_comp'));
    });

    expect(store.getState().challenge.pending?.id).toBe(firstId);
  });

  it('clears an in-progress challenge when a new campaign resets the game', () => {
    const store = makeStore();
    const participants = store.getState().game.players.map((player) => player.id);

    dispatchThunk(store, startChallenge(42, participants, { prizeType: 'LOH' }));
    store.dispatch(
      recordRun({
        id: 'previous-campaign-challenge',
        gameKey: 'quickTap',
        seed: 42,
        participants,
        rawScores: {},
        canonicalScores: {},
        winnerId: participants[0],
        timestamp: Date.now(),
        authoritative: false,
      }),
    );

    expect(store.getState().challenge.pending).not.toBeNull();
    expect(store.getState().challenge.history).toHaveLength(1);

    store.dispatch(resetGame());

    expect(store.getState().game.phase).toBe('week_start');
    expect(store.getState().challenge.pending).toBeNull();
    expect(store.getState().challenge.history).toEqual([]);
  });

  it('renders MinigameHost (role=dialog) when challenge.pending is set', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      store.dispatch(setPhase('loh_comp'));
    });

    // MinigameHost renders with role="dialog" and an aria-label containing "minigame".
    // (MinigameRules inside it also has role="dialog", so use getAllByRole.)
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    expect(dialogs.some((d) => d.classList.contains('minigame-host'))).toBe(true);
  });

  it('ends a classic run when the human was evicted before the Tribunal', () => {
    const store = makeStoreWithGame({
      status: 'active',
      phase: 'loh_comp',
      seed: 42,
      players: [
        { id: 'user', name: 'You', avatar: '🙂', status: 'evicted', isUser: true },
        { id: 'p1', name: 'Ari', avatar: '🙂', status: 'active', isUser: false },
        { id: 'p2', name: 'Bo', avatar: '🙂', status: 'active', isUser: false },
      ],
    });

    renderWithStore(store);

    expect(screen.getByRole('dialog', { name: 'Your season is over' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'You were eliminated before the Tribunal began, so you cannot return to the game or cast a finale vote.',
      ),
    ).toBeInTheDocument();
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

  it('forces Find your twin for an activated but unresolved Day 5 Twin Shock', () => {
    const initialGame = gameReducer(undefined, { type: '@@INIT' });
    const store = makeStoreWithGame({
      week: 5,
      phase: 'loh_comp',
      twinShockConsumed: true,
      twinShockResolution: null,
    });
    const participants = initialGame.players.map((player) => player.id);

    dispatchThunk(store, startChallenge(55, participants, { prizeType: 'LOH' }));

    expect(store.getState().challenge.pending?.game.key).toBe('castleRescue');
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

  it('unique: uses the bracket template pool when prizeType is known', () => {
    const store = makeStoreWithCompSelection({ mode: 'unique', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2', 'p3', 'p4'], { prizeType: 'POS' }));

    const alivePlayerCount = store
      .getState()
      .game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury').length;
    const expectedPool = getBracketPoolForContext(alivePlayerCount, 'POS');
    const pending = store.getState().challenge.pending;

    expect(expectedPool.length).toBeGreaterThan(0);
    expect(expectedPool).toContain(pending?.game.key);
  });

  it('unique: does not reuse an eligible game until the current pool is exhausted', () => {
    const store = makeStoreWithCompSelection({ mode: 'unique', enabledIds: [] });
    const state = store.getState();
    const alivePlayerCount = state.game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury',
    ).length;
    const eligibleKeys = getClassicCampaignPoolForContext({
      day: state.game.week,
      playerCount: alivePlayerCount,
      compType: 'POS',
      phase: 'pos_comp',
    });
    const onlyUnusedKey = eligibleKeys.at(-1);
    expect(onlyUnusedKey).toBeDefined();

    eligibleKeys.slice(0, -1).forEach((gameKey, index) => {
      store.dispatch(recordRun({
        id: `used-by-earlier-loh-or-pos-${index}`,
        gameKey,
        seed: index,
        participants: [],
        rawScores: {},
        canonicalScores: {},
        winnerId: 'p1',
        timestamp: index,
        authoritative: false,
      }));
    });

    dispatchThunk(store, startChallenge(91, state.game.players.map((player) => player.id), { prizeType: 'POS' }));
    expect(store.getState().challenge.pending?.game.key).toBe(onlyUnusedKey);

    store.dispatch(recordRun({
      id: 'used-final-eligible-game',
      gameKey: onlyUnusedKey!,
      seed: 99,
      participants: [],
      rawScores: {},
      canonicalScores: {},
      winnerId: 'p1',
      timestamp: 99,
      authoritative: false,
    }));
    store.dispatch(setPendingChallenge(null));

    dispatchThunk(store, startChallenge(92, state.game.players.map((player) => player.id), { prizeType: 'POS' }));
    expect(eligibleKeys).toContain(store.getState().challenge.pending?.game.key);
  });

  it('unique: routes Final 3 parts through their phase-specific LOH pools', () => {
    const players = [
      { id: 'p1', name: 'Ari', avatar: '🙂', status: 'active' as const, isUser: true },
      { id: 'p2', name: 'Bo', avatar: '🙂', status: 'active' as const, isUser: false },
      { id: 'p3', name: 'Cy', avatar: '🙂', status: 'active' as const, isUser: false },
    ];
    const store = makeStoreWithGame({
      week: 14,
      phase: 'final3_comp2_minigame',
      players,
    });
    const expectedPool = getClassicCampaignPoolForContext({
      day: 14,
      playerCount: 3,
      compType: 'LOH',
      phase: 'final3_comp2_minigame',
    });

    dispatchThunk(store, startChallenge(144, players.map((player) => player.id)));

    expect(expectedPool).toContain(store.getState().challenge.pending?.game.key);
  });

  it('random-games: falls back to the existing random selection', () => {
    const store = makeStoreWithCompSelection({ mode: 'random-games', enabledIds: [] });

    dispatchThunk(store, startChallenge(42, ['p1', 'p2']));

    const pending = store.getState().challenge.pending;
    expect(pending).not.toBeNull();
    expect(typeof pending?.game.key).toBe('string');
  });

  it('survivor mode rotates through all roster-safe non-retired games, independently of Classic', () => {
    const store = makeSurvivorStore();
    const playerCount = store.getState().game.players.filter(
      (player) => player.status !== 'evicted' && player.status !== 'jury',
    ).length;
    const availableKeys = getPoolByFilter({ retired: false })
      .filter((game) => supportsPlayerCount(game, playerCount))
      .map((game) => game.key);
    const classicKeys = new Set(getApprovedCompetitionGameKeys());
    const survivorOnlyKeys = availableKeys.filter((key) => !classicKeys.has(key));
    const selectedKeys = new Set<string>();

    expect(survivorOnlyKeys.length).toBeGreaterThan(0);
    availableKeys.forEach((_, index) => {
      dispatchThunk(store, startChallenge(42 + index, store.getState().game.players.map((player) => player.id)));
      const pending = store.getState().challenge.pending;
      expect(pending?.game.retired).toBe(false);
      selectedKeys.add(pending?.game.key ?? '');
      store.dispatch(setPendingChallenge(null));
    });

    expect([...selectedKeys].some((key) => survivorOnlyKeys.includes(key))).toBe(true);
    expect(selectedKeys.size).toBe(availableKeys.length);
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
