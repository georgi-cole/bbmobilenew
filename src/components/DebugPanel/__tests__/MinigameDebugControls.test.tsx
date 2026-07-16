import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import challengeReducer from '../../../store/challengeSlice';
import { getAllGames } from '../../../minigames/registry';
import MinigameDebugControls from '../MinigameDebugControls';

describe('MinigameDebugControls', () => {
  it('opens the in-panel game picker and applies a selected game', async () => {
    const user = userEvent.setup();
    const store = configureStore({ reducer: { challenge: challengeReducer } });
    const game = getAllGames().find((entry) => !entry.retired);

    expect(game).toBeDefined();

    render(
      <Provider store={store}>
        <MinigameDebugControls />
      </Provider>,
    );

    const trigger = screen.getByRole('button', { name: 'Force Game' });
    expect(screen.queryByRole('listbox', { name: 'Minigame options' })).toBeNull();

    await user.click(trigger);
    expect(screen.getByRole('listbox', { name: 'Minigame options' })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: game!.title }));
    expect(trigger).toHaveTextContent(game!.title);
    expect(screen.queryByRole('listbox', { name: 'Minigame options' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(store.getState().challenge.debug.forceGameKey).toBe(game!.key);
  });
});
