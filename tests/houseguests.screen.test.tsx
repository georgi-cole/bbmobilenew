import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import Houseguests from '../src/screens/Houseguests/Houseguests';
import { AVATAR_TILE_LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_THRESHOLD_PX } from '../src/components/HouseguestGrid/AvatarTile';
import { enrichPlayer } from '../src/utils/houseguestLookup';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
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
    expect(screen.getByLabelText(`${playerCount}/${playerCount} housemates`)).toBeInTheDocument();
  });

  it('opens the compact player info dialog on avatar tap', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    const player = store
      .getState()
      .game.players.find((candidate) => {
        const enriched = enrichPlayer(candidate);
        return enriched.age !== undefined && Boolean(enriched.profession);
      });
    if (!player) {
      throw new Error('Expected at least one player with profile metadata');
    }
    const enrichedPlayer = enrichPlayer(player);

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

  it('opens the compact player info dialog on mobile touch tap', () => {
    const store = makeStore();
    const player = store
      .getState()
      .game.players.find((candidate) => {
        const enriched = enrichPlayer(candidate);
        return enriched.age !== undefined && Boolean(enriched.profession);
      });
    if (!player) {
      throw new Error('Expected at least one player with profile metadata');
    }
    const enrichedPlayer = enrichPlayer(player);

    render(
      <Provider store={store}>
        <Houseguests />
      </Provider>,
    );

    const tile = screen.getByRole('button', { name: new RegExp(player.name, 'i') });

    fireEvent.touchStart(tile, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchEnd(tile);
    fireEvent.click(tile);

    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('opens the compact player info dialog on mobile long press and does not suppress the next real tap', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const player = store
      .getState()
      .game.players.find((candidate) => {
        const enriched = enrichPlayer(candidate);
        return enriched.age !== undefined && Boolean(enriched.profession);
      });
    if (!player) {
      throw new Error('Expected at least one player with profile metadata');
    }
    const enrichedPlayer = enrichPlayer(player);

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

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    tile.dispatchEvent(contextMenuEvent);
    expect(contextMenuEvent.defaultPrevented).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i') })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(tile);

    expect(
      screen.getByRole('dialog', {
        name: new RegExp(`${enrichedPlayer.fullName ?? player.name} details`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('does not open the dialog when the finger moves beyond the threshold before long-press fires', () => {
    vi.useFakeTimers();

    const store = makeStore();
    const player = store.getState().game.players.find((candidate) => {
      const enriched = enrichPlayer(candidate);
      return enriched.age !== undefined && Boolean(enriched.profession);
    });
    if (!player) {
      throw new Error('Expected at least one player with profile metadata');
    }
    const enrichedPlayer = enrichPlayer(player);

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
});
