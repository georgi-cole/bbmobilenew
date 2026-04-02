import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
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

describe('TvZone screen styling', () => {
  it('keeps the viewport markup clean so reflection and scanlines can come from pseudo-elements', () => {
    const { container } = renderTvZone();
    const viewport = container.querySelector('.tv-zone__viewport');

    expect(viewport).toBeTruthy();
    expect(viewport?.querySelector('.tv-zone__glare')).toBeNull();
    expect(viewport?.querySelector('.tv-zone__scanlines')).toBeNull();
    expect(viewport?.querySelector('.tv-zone__vignette')).toBeNull();
  });
});
