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
import type { TvEvent } from '../../../types';
import { getViewportMessageKey } from '../tvZoneKeys';

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

it('renders a broadcast hierarchy around the current TV message', () => {
    const { container } = renderTvZone();
    expect(container.querySelector('.tv-zone__story')).toBeTruthy();
    expect(container.querySelector('.tv-zone__story-eyebrow')?.textContent).toBe('House update');
    expect(container.querySelector('.tv-zone__story-context')?.textContent).toMatch(/Day 1/i);
  });
  it('builds stable fallback keys for repeated text and different keys for different text', () => {
    const baseEvent: TvEvent = {
      id: '',
      text: 'Signal locked.',
      type: 'game',
      timestamp: 123,
    };

    const sameTextKey = getViewportMessageKey({ ...baseEvent });
    const repeatedTextKey = getViewportMessageKey({ ...baseEvent });
    const differentTextKey = getViewportMessageKey({ ...baseEvent, text: 'Signal updated.' });

    expect(sameTextKey).toBe(repeatedTextKey);
    expect(sameTextKey).not.toBe(differentTextKey);
  });
});
