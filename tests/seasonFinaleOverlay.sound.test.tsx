import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import SeasonFinaleOverlay from '../src/components/SeasonFinale/SeasonFinaleOverlay';
import gameReducer, {
  openFavoritePlayerVoting,
  resumeAfterPublicFavorite,
  startPublicFavorite,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import uiReducer from '../src/store/uiSlice';

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' });
  const winnerId = 'user';
  const runnerUpId = baseGame.players.find((player) => player.id !== winnerId)?.id ?? 'p1';

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      ui: uiReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        players: baseGame.players.map((player) => {
          if (player.id === winnerId) {
            return { ...player, isWinner: true, finalRank: 1 };
          }
          if (player.id === runnerUpId) {
            return { ...player, finalRank: 2 };
          }
          return player;
        }),
        seasonFinale: {
          phase: 'publicFavoriteSetup',
          winnerId,
          interviewIndex: 0,
          goodbyeIndex: 0,
          isChatOpen: true,
          isLightsOffAnimating: false,
          publicFavoriteEnabled: true,
        },
      },
      settings: settingsReducer(undefined, { type: '@@INIT' }),
      ui: uiReducer(undefined, { type: '@@INIT' }),
    },
  });
}

describe('SeasonFinaleOverlay audio scenes', () => {
  it('starts public voting music only when the voting overlay opens and clears it on resume', async () => {
    const store = makeStore();
    const winnerId = store.getState().game.seasonFinale?.winnerId;

    render(
      <Provider store={store}>
        <MemoryRouter>
          <SeasonFinaleOverlay />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(store.getState().ui.musicScene).toBe('none');
    });

    act(() => {
      store.dispatch(startPublicFavorite());
    });

    await waitFor(() => {
      expect(store.getState().game.favoritePlayer?.active).toBe(true);
      expect(store.getState().game.favoritePlayer?.votingStarted).toBe(false);
      expect(store.getState().ui.musicScene).toBe('none');
    });

    act(() => {
      store.dispatch(openFavoritePlayerVoting());
    });

    await waitFor(() => {
      expect(store.getState().ui.musicScene).toBe('public_voting');
    });

    act(() => {
      store.dispatch(resumeAfterPublicFavorite({ winnerId: winnerId ?? undefined }));
    });

    await waitFor(() => {
      expect(store.getState().ui.musicScene).toBe('none');
    });
  });
});
