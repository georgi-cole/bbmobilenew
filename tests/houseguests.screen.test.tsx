import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import Houseguests from '../src/screens/Houseguests/Houseguests';
import { AVATAR_TILE_LONG_PRESS_DELAY_MS, LONG_PRESS_CLICK_SUPPRESSION_MS, LONG_PRESS_MOVE_THRESHOLD_PX } from '../src/components/HouseguestGrid/AvatarTile';
import { enrichPlayer } from '../src/utils/houseguestLookup';

function makeStore(gameOverrides: Record<string, unknown> = {}) {
  const baseGame = gameReducer(undefined, { type: '@@INIT' });
  const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      game: { ...baseGame, ...gameOverrides },
      settings: baseSettings,
    },
  });
}

/** Helper to find a player that has enough profile metadata to display in the dialog. */
function findProfilePlayer(store: ReturnType<typeof makeStore>) {
  const player = store.getState().game.players.find((candidate) => {
    const enriched = enrichPlayer(candidate);
    return enriched.age !== undefined && Boolean(enriched.profession);
  });
  if (!player) throw new Error('Expected at least one player with profile metadata');
  return { player, enrichedPlayer: enrichPlayer(player) };
}

describe('Houseguests screen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Housemates title and occupancy chip', () => {
    const store = makeStore();
    const playerCount = store.getState().game.players.length;

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Housemates/i })).toBeInTheDocument();
    expect(screen.getByLabelText(`${playerCount}/${playerCount} players`)).toBeInTheDocument();
  });

  it('shows the veto-safe badge label for players protected for the rest of the cycle', () => {
    const baseStore = makeStore();
    const protectedPlayer = baseStore.getState().game.players.find((player) => player.status === 'active');
    if (!protectedPlayer) throw new Error('Expected an active player to mark as veto-safe');

    const store = makeStore({ povProtectedIds: [protectedPlayer.id] });

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    expect(
      screen.getByRole('button', {
        name: new RegExp(`${protectedPlayer.name}.*Veto Safe`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('opens the compact player info dialog on avatar tap', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    await user.click(screen.getByRole('button', { name: new RegExp(player.name, 'i') }));

    const dialog = screen.getByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') });

    expect(dialog).toBeInTheDocument();
    expect(document.activeElement).toHaveClass('hg-info-dialog');
    expect(screen.getByText(/Age/i)).toBeInTheDocument();
    expect(screen.getByText(/Occupation/i)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') })).toBeNull();
  });

  it('opens the compact player info dialog on mobile touch tap (short press)', () => {
    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Short tap: touchStart + touchEnd (no long-press timer fires) + click
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(tile);
    fireEvent.click(tile);

    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('shows the hold-preview dialog while the finger remains down after the long-press threshold', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Arm the long-press timer
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });

    // Before threshold: dialog must NOT appear yet
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS - 1);
    });
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();

    // At/after threshold: hold-preview dialog must appear while finger is still down
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('auto-dismisses the hold-preview when the finger is released', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Hold until preview appears
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });
    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();

    // Release: preview must auto-dismiss
    fireEvent.touchEnd(tile);
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();
  });

  it('auto-dismisses the hold-preview when the touch is cancelled', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });
    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();

    // Cancel (e.g. system interruption): preview must also dismiss
    fireEvent.touchCancel(tile);
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();
  });

  it('after hold-preview dismissal on release, a subsequent short tap reopens the dialog', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Trigger hold preview then release
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });
    fireEvent.touchEnd(tile);
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();

    // Wait out the click-suppression window, then do a normal tap
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_CLICK_SUPPRESSION_MS + 50);
    });
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(tile);
    fireEvent.click(tile);

    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('suppresses the native context menu on hold', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    tile.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);
  });

  it('cancels the hold-preview when the finger moves beyond the movement threshold', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Start touch, then move significantly (scroll gesture) before the timer fires
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchMove(tile, { touches: [{ clientX: 0, clientY: LONG_PRESS_MOVE_THRESHOLD_PX + 1 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });

    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();
  });

  it('keeps the hold-preview visible when the finger moves after hold fires, then dismisses on release', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const { player, enrichedPlayer } = findProfilePlayer(store);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    // Hold until preview appears
    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    act(() => {
      vi.advanceTimersByTime(AVATAR_TILE_LONG_PRESS_DELAY_MS);
    });
    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();

    // Move finger beyond threshold: preview should stay open until the finger lifts
    fireEvent.touchMove(tile, { touches: [{ clientX: 0, clientY: LONG_PRESS_MOVE_THRESHOLD_PX + 1 }] });
    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();

    fireEvent.touchEnd(tile);
    expect(
      screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') }),
    ).toBeNull();
  });
});
