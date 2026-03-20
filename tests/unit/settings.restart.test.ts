/**
 * Tests for the restart-required settings flow.
 *
 * Covers:
 *  1. getRestartRelevantSnapshotFromSettings derives from live state (not localStorage)
 *  2. Changing cast size is reflected in the snapshot even without a blur event
 *  3. Choosing Restart via resetGame() applies the new cast size immediately
 *  4. Choosing Stay leaves the current game unchanged
 *  5. Non-gameplay settings (audio, display, visual) do not appear in the snapshot
 *  6. Changing compSelection triggers restart-required detection
 *  7. createInitialGameState() reads fresh settings on every call (not stale module state)
 *  8. resetGame() produces a fresh roster whose size matches the saved cast size
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { resetGame, createInitialGameState } from '../../src/store/gameSlice';
import settingsReducer, {
  DEFAULT_SETTINGS,
  saveSettings,
  STORAGE_KEY,
  setGameUX,
  setSim,
  type SettingsState,
} from '../../src/store/settingsSlice';
import {
  getRestartRelevantSnapshotFromSettings,
  getRestartRelevantSnapshot,
} from '../../src/store/settingsHelpers';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeStore(preloadedSettings?: Partial<SettingsState>) {
  const settings: SettingsState = preloadedSettings
    ? { ...DEFAULT_SETTINGS, ...preloadedSettings }
    : DEFAULT_SETTINGS;
  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: { settings },
  });
}

/** Build a SettingsState by merging gameUX overrides onto DEFAULT_SETTINGS. */
function makeGameUXSettings(gameUXOverrides: Partial<SettingsState['gameUX']>): SettingsState {
  return { ...DEFAULT_SETTINGS, gameUX: { ...DEFAULT_SETTINGS.gameUX, ...gameUXOverrides } };
}

/** Persist settings to localStorage so gameSlice helpers can read them. */
function persistSettings(s: SettingsState) {
  saveSettings(s);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

// ── 1. Snapshot derives from live SettingsState, not localStorage ─────────────

describe('getRestartRelevantSnapshotFromSettings', () => {
  it('derives snapshot from the provided object, ignoring localStorage', () => {
    // Put an old value in localStorage
    persistSettings(makeGameUXSettings({ castSize: 8 }));

    // Pass a live state with a different castSize
    const liveSettings = makeGameUXSettings({ castSize: 14 });

    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot.gameUX.castSize).toBe(14);
  });

  it('includes compSelection in the snapshot', () => {
    const liveSettings = makeGameUXSettings({
      compSelection: {
        mode: 'single-game',
        selectedGameId: 'tap-race',
        enabledIds: [],
        weeklyLimit: null,
        filterCategory: null,
      },
    });
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot.gameUX.compSelection.mode).toBe('single-game');
  });

  it('includes spectatorMode in the snapshot', () => {
    const liveSettings = makeGameUXSettings({ spectatorMode: true });
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot.gameUX.spectatorMode).toBe(true);
  });

  it('includes all sim fields', () => {
    const liveSettings: SettingsState = {
      ...DEFAULT_SETTINGS,
      sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 75 },
    };
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot.sim.enableTwists).toBe(true);
    expect(snapshot.sim.battleBackChance).toBe(75);
  });

  it('does NOT include audio settings', () => {
    const liveSettings = { ...DEFAULT_SETTINGS };
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot).not.toHaveProperty('audio');
  });

  it('does NOT include display settings', () => {
    const liveSettings = { ...DEFAULT_SETTINGS };
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot).not.toHaveProperty('display');
  });

  it('does NOT include pure-UI gameUX fields (animations, useHaptics, compactRoster)', () => {
    const liveSettings = { ...DEFAULT_SETTINGS };
    const snapshot = getRestartRelevantSnapshotFromSettings(liveSettings);
    expect(snapshot.gameUX).not.toHaveProperty('animations');
    expect(snapshot.gameUX).not.toHaveProperty('useHaptics');
    expect(snapshot.gameUX).not.toHaveProperty('compactRoster');
  });
});

// ── 2. Cast-size change detected without blur ──────────────────────────────────

describe('restart-required detection — cast size', () => {
  it('detects a cast size change when comparing two live snapshots', () => {
    const before = makeGameUXSettings({ castSize: 12 });
    const after  = makeGameUXSettings({ castSize: 14 });

    const snapshotBefore = getRestartRelevantSnapshotFromSettings(before);
    const snapshotAfter  = getRestartRelevantSnapshotFromSettings(after);

    expect(JSON.stringify(snapshotBefore)).not.toBe(JSON.stringify(snapshotAfter));
  });

  it('does NOT flag a restart when only audio changes', () => {
    const before: SettingsState = { ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, musicOn: true } };
    const after:  SettingsState = { ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, musicOn: false } };

    const snapshotBefore = getRestartRelevantSnapshotFromSettings(before);
    const snapshotAfter  = getRestartRelevantSnapshotFromSettings(after);

    expect(JSON.stringify(snapshotBefore)).toBe(JSON.stringify(snapshotAfter));
  });

  it('does NOT flag a restart when only display theme changes', () => {
    const before: SettingsState = {
      ...DEFAULT_SETTINGS,
      display: { ...DEFAULT_SETTINGS.display, themePreset: 'midnight' },
    };
    const after: SettingsState = {
      ...DEFAULT_SETTINGS,
      display: { ...DEFAULT_SETTINGS.display, themePreset: 'neon' },
    };

    const snapshotBefore = getRestartRelevantSnapshotFromSettings(before);
    const snapshotAfter  = getRestartRelevantSnapshotFromSettings(after);

    expect(JSON.stringify(snapshotBefore)).toBe(JSON.stringify(snapshotAfter));
  });

  it('does NOT flag a restart when only animations or haptics change', () => {
    const before = { ...DEFAULT_SETTINGS };
    const after  = makeGameUXSettings({
      animations: !DEFAULT_SETTINGS.gameUX.animations,
      useHaptics: false,
    });

    const snapshotBefore = getRestartRelevantSnapshotFromSettings(before);
    const snapshotAfter  = getRestartRelevantSnapshotFromSettings(after);

    expect(JSON.stringify(snapshotBefore)).toBe(JSON.stringify(snapshotAfter));
  });
});

// ── 3. compSelection change triggers restart-required detection ───────────────

describe('restart-required detection — compSelection', () => {
  it('detects a compSelection mode change', () => {
    const before = makeGameUXSettings({
      compSelection: { mode: 'random-games', enabledIds: [], weeklyLimit: null, filterCategory: null },
    });
    const after = makeGameUXSettings({
      compSelection: {
        mode: 'single-game',
        selectedGameId: 'tap-race',
        enabledIds: [],
        weeklyLimit: null,
        filterCategory: null,
      },
    });

    const snapshotBefore = getRestartRelevantSnapshotFromSettings(before);
    const snapshotAfter  = getRestartRelevantSnapshotFromSettings(after);

    expect(JSON.stringify(snapshotBefore)).not.toBe(JSON.stringify(snapshotAfter));
  });
});

// ── 4. resetGame() uses fresh cast size from persisted settings ───────────────

describe('resetGame() uses fresh settings', () => {
  it('rebuilds roster with the cast size persisted before the reset', () => {
    const customSettings = makeGameUXSettings({ castSize: 6 });
    persistSettings(customSettings);

    const store = makeStore(customSettings);
    store.dispatch(resetGame());

    const players = store.getState().game.players;
    expect(players).toHaveLength(6);
  });

  it('rebuilds roster with castSize = 4 (minimum)', () => {
    const customSettings = makeGameUXSettings({ castSize: 4 });
    persistSettings(customSettings);

    const store = makeStore(customSettings);
    store.dispatch(resetGame());

    const players = store.getState().game.players;
    expect(players).toHaveLength(4);
  });

  it('rebuilds roster with castSize = 16 (maximum)', () => {
    const customSettings = makeGameUXSettings({ castSize: 16 });
    persistSettings(customSettings);

    const store = makeStore(customSettings);
    store.dispatch(resetGame());

    const players = store.getState().game.players;
    expect(players).toHaveLength(16);
  });

  it('resets to week 1, phase week_start', () => {
    const store = makeStore();
    persistSettings(DEFAULT_SETTINGS);
    store.dispatch(resetGame());

    const { week, phase } = store.getState().game;
    expect(week).toBe(1);
    expect(phase).toBe('week_start');
  });

  it('preserves existing seasonArchives when no payload is provided', () => {
    const store = makeStore();
    persistSettings(DEFAULT_SETTINGS);
    // Force some archives into state using a minimal valid SeasonArchive shape
    const existingArchives = [{ seasonIndex: 1, seasonId: 'season-1', playerSummaries: [] }];
    store.dispatch(resetGame(existingArchives));
    store.dispatch(resetGame()); // second reset with no explicit archives

    const { seasonArchives } = store.getState().game;
    expect(seasonArchives).toHaveLength(1);
    expect(seasonArchives[0].seasonId).toBe('season-1');
  });
});

// ── 5. createInitialGameState() uses fresh settings each call ────────────────

describe('createInitialGameState() factory', () => {
  it('builds a roster sized to current persisted castSize each time it is called', () => {
    // First call with castSize 8
    persistSettings(makeGameUXSettings({ castSize: 8 }));
    const state1 = createInitialGameState();
    expect(state1.players).toHaveLength(8);

    // Second call with castSize 10
    persistSettings(makeGameUXSettings({ castSize: 10 }));
    const state2 = createInitialGameState();
    expect(state2.players).toHaveLength(10);
  });

  it('always starts at week 1, phase week_start', () => {
    persistSettings(DEFAULT_SETTINGS);
    const state = createInitialGameState();
    expect(state.week).toBe(1);
    expect(state.phase).toBe('week_start');
  });
});

// ── 6. Stay action: current game is preserved ─────────────────────────────────

describe('"Stay" behaviour — game state is unchanged', () => {
  it('dispatching setGameUX castSize does not change the current game roster', () => {
    const store = makeStore();
    persistSettings(DEFAULT_SETTINGS);
    const playersBefore = store.getState().game.players.length;

    // Simulate user changing cast size (without a restart)
    store.dispatch(setGameUX({ castSize: 4 }));

    // Game roster must stay the same
    expect(store.getState().game.players).toHaveLength(playersBefore);
  });

  it('dispatching setSim enableTwists does not change the current game phase', () => {
    const store = makeStore();
    persistSettings(DEFAULT_SETTINGS);
    const phaseBefore = store.getState().game.phase;

    store.dispatch(setSim({ enableTwists: true }));

    expect(store.getState().game.phase).toBe(phaseBefore);
  });
});

// ── 7. getRestartRelevantSnapshot() backward-compat thin wrapper ──────────────

describe('getRestartRelevantSnapshot() (localStorage wrapper)', () => {
  it('reads from localStorage and returns only gameplay-affecting fields', () => {
    persistSettings({
      ...DEFAULT_SETTINGS,
      gameUX: { ...DEFAULT_SETTINGS.gameUX, castSize: 9, spectatorMode: true },
      sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true },
    });

    const snapshot = getRestartRelevantSnapshot();
    expect(snapshot.gameUX.castSize).toBe(9);
    expect(snapshot.gameUX.spectatorMode).toBe(true);
    expect(snapshot.sim.enableTwists).toBe(true);
    expect(snapshot).not.toHaveProperty('audio');
  });

  it('falls back to DEFAULT_SETTINGS when localStorage is empty', () => {
    const snapshot = getRestartRelevantSnapshot();
    expect(snapshot.gameUX.castSize).toBe(DEFAULT_SETTINGS.gameUX.castSize);
  });
});

// ── 8. Restart flow: dispatch setGameUX then resetGame gives correct roster ───

describe('full restart flow', () => {
  it('dispatching setGameUX then resetGame uses the new cast size', () => {
    const store = makeStore();

    // User changes cast size to 6 in Settings, then dispatches resetGame
    store.dispatch(setGameUX({ castSize: 6 }));
    // Simulate the store.subscribe persistence (in the real app this happens via the
    // store subscriber, here we do it manually since the test store has no subscriber)
    persistSettings(store.getState().settings);

    store.dispatch(resetGame());

    expect(store.getState().game.players).toHaveLength(6);
  });
});
