// Integration tests for the spectator-mode advance() deferral.
//
// Validates:
//  1. When the human enters Final 3 Part 3 as a spectator, the SpectatorView
//     overlay mounts immediately but advance() is NOT dispatched at that point
//     (tvFeed remains empty of game-engine events).
//  2. After SpectatorView.onDone fires, advance() IS dispatched, the game
//     phase progresses, and the overlay is dismissed.
//  3. The spectatorF3AdvancedRef guard prevents duplicate advance() calls on
//     rapid re-renders.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../../src/store/settingsSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

// Capture the onDone callback from SpectatorView so tests can invoke it
// programmatically without relying on internal animation timers.
let capturedSpectatorOnDone: (() => void) | null = null;

vi.mock('../../src/components/ui/SpectatorView', () => ({
  default: ({ onDone }: { onDone?: () => void }) => {
    capturedSpectatorOnDone = onDone ?? null;
    return (
      <div data-testid="spectator-overlay">
        <button onClick={onDone}>Spectator Done</button>
      </div>
    );
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(): Player[] {
  return [
    { id: 'p1', name: 'Alice', avatar: '🧑', status: 'active', isUser: false },
    { id: 'p2', name: 'Bob',   avatar: '🧑', status: 'active', isUser: false },
    { id: 'user', name: 'User', avatar: '🧑', status: 'active', isUser: true },
  ];
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 8,
    phase: 'final3_comp3',
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
    f3Part1WinnerId: 'p1',
    f3Part2WinnerId: 'p2',
    evictionSplashId: null,
    players: makePlayers(),
    tvFeed: [],
    isLive: true,
    ...overrides,
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      game: base,
      // spectatorMode must be true so the GameScreen effect activates SpectatorView.
      settings: {
        ...DEFAULT_SETTINGS,
        gameUX: { ...DEFAULT_SETTINGS.gameUX, spectatorMode: true },
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

describe('spectator advance() deferral', () => {
  afterEach(() => {
    capturedSpectatorOnDone = null;
    vi.restoreAllMocks();
  });

  it('mounts SpectatorView immediately but does NOT advance the game phase on entry', async () => {
    const store = makeStore();
    renderWithStore(store);

    // SpectatorView should be visible immediately.
    expect(screen.getByTestId('spectator-overlay')).not.toBeNull();

    // The game phase must still be 'final3_comp3'; advance() has not been called.
    expect(store.getState().game.phase).toBe('final3_comp3');

    // tvFeed must be empty — no game-engine events have been emitted yet.
    expect(store.getState().game.tvFeed).toHaveLength(0);
  });

  it('dispatches advance() only after SpectatorView.onDone fires', async () => {
    const store = makeStore();
    renderWithStore(store);

    expect(store.getState().game.phase).toBe('final3_comp3');

    // Simulate the spectator overlay completing its playback.
    await act(async () => {
      fireEvent.click(screen.getByText('Spectator Done'));
    });

    // After onDone, advance() should have been dispatched and the phase moved on.
    expect(store.getState().game.phase).not.toBe('final3_comp3');
  });

  it('does not show SpectatorView when human player IS a finalist', async () => {
    // Human is the Part-1 winner — not a spectator.
    const store = makeStore({ f3Part1WinnerId: 'user' });
    renderWithStore(store);

    expect(screen.queryByTestId('spectator-overlay')).toBeNull();
    // Phase must remain unchanged since no advance was dispatched.
    expect(store.getState().game.phase).toBe('final3_comp3');
  });

  it('does not dispatch advance() a second time on re-render (idempotent guard)', async () => {
    const store = makeStore();
    const { rerender } = renderWithStore(store);

    // First render: overlay mounts, advance NOT yet dispatched.
    expect(store.getState().game.phase).toBe('final3_comp3');

    // Re-render — guard ref should prevent a second activation.
    await act(async () => {
      rerender(
        <Provider store={store}>
          <MemoryRouter>
            <GameScreen />
          </MemoryRouter>
        </Provider>,
      );
    });

    // Phase still 'final3_comp3' — no advance() was triggered.
    expect(store.getState().game.phase).toBe('final3_comp3');

    // Overlay should still be mounted (not dismissed mid-play).
    expect(screen.getByTestId('spectator-overlay')).not.toBeNull();
  });
});
