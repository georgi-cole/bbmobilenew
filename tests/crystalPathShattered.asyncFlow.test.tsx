import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CrystalPathShatteredGame from '../src/minigames/crystalPathShattered/CrystalPathShatteredGame';
import { SAFE_STEP_MS, createRowStream } from '../src/minigames/crystalPathShattered/shatteredLogic';
import gameReducer from '../src/store/gameSlice';
import { mulberry32 } from '../src/store/rng';

vi.mock('../src/hooks/useGlassBridgeAudio', () => ({
  useGlassBridgeAudio: () => ({
    playSafeStep: vi.fn(),
    playDeath: vi.fn(),
    playWinner: vi.fn(),
    playNewTurn: vi.fn(),
  }),
}));

function makeStore() {
  return configureStore({ reducer: { game: gameReducer } });
}

describe('Crystal Path: Infinity async flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with the human and keeps that run active after a safe step', async () => {
    const seed = 12345;
    const [firstRow, secondRow] = createRowStream(mulberry32(seed)).take(2);

    render(
      <Provider store={makeStore()}>
        <CrystalPathShatteredGame
          participantIds={['ai-1', 'human']}
          participants={[
            { id: 'ai-1', name: 'AI One', isHuman: false },
            { id: 'human', name: 'Human', isHuman: true },
          ]}
          seed={seed}
        />
      </Provider>,
    );

    expect(screen.getAllByText('You').length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('button', { name: `Row 1 ${firstRow.safeSide} tile` }),
    );

    await act(async () => {
      vi.advanceTimersByTime(SAFE_STEP_MS + 20);
    });

    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    expect(screen.getByText('Row 2')).toBeTruthy();
    expect(screen.queryByText('AI One keeps climbing…')).toBeNull();
    expect(
      screen.getByRole('button', { name: `Row 2 ${secondRow.safeSide} tile` }),
    ).not.toHaveAttribute('disabled');
  });
});
