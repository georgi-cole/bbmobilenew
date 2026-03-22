import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import gameReducer from '../../../store/gameSlice';
import socialReducer from '../../../social/socialSlice';
import profilesReducer from '../../../store/profilesSlice';
import challengeReducer from '../../../store/challengeSlice';
import finaleReducer from '../../../store/finaleSlice';
import TvZone from '../TvZone';

function renderTvZone() {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TvZone />
      </MemoryRouter>
    </Provider>,
  );
}

describe('TvZone save chip', () => {
  it('shows a Save chip in the top-right actions instead of the Diary Room chip', () => {
    renderTvZone();

    const saveChip = screen.getByRole('button', { name: /no active profile selected/i });
    expect(saveChip).toBeDefined();
    expect((saveChip as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /open diary room/i })).toBeNull();
  });
});
