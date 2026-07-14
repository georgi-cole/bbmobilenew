import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp';
import {
  buildHouseOfCardsBoard,
  chooseHouseOfCardsFinalWinner,
} from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils';
import houseOfCardsReducer, {
  HOUSE_OF_CARDS_TILE_COUNTS,
} from '../../../src/features/houseOfCards/houseOfCardsSlice';

function makeStore() {
  return configureStore({
    reducer: {
      game: (state = { phase: 'loh_comp' }) => state,
      houseOfCards: houseOfCardsReducer,
    },
  });
}

function renderGame(seed = 42) {
  const store = makeStore();
  render(
    <Provider store={store}>
      <HouseOfCardsComp
        participantIds={['human']}
        participants={[{ id: 'human', name: 'You', isHuman: true }]}
        prizeType="LOH"
        seed={seed}
      />
    </Provider>,
  );
  return store;
}

function getPairIndexes(seed: number, pairCount: number): number[][] {
  const bySymbol = new Map<string, number[]>();
  buildHouseOfCardsBoard(seed, pairCount).forEach((card) => {
    bySymbol.set(card.symbol, [...(bySymbol.get(card.symbol) ?? []), card.index]);
  });
  return [...bySymbol.values()];
}

describe('HouseOfCardsComp — five-round tournament', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the requested board sizes and has an elapsed timer with no cutoff', () => {
    expect(HOUSE_OF_CARDS_TILE_COUNTS).toEqual([8, 12, 16, 20, 24]);
    renderGame();

    expect(screen.getByText('Round 1/5')).toBeInTheDocument();
    expect(screen.getByText('8 tiles')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(8);

    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByText('61s')).toBeInTheDocument();
    expect(screen.getByText('Elapsed · no limit')).toBeInTheDocument();
    expect(screen.getByLabelText('Round 1 card grid')).toBeInTheDocument();
  });

  it('advances from the 8-tile first round to the 12-tile second round', async () => {
    const seed = 42;
    renderGame(seed);
    const pairs = getPairIndexes(seed, 4);

    for (const pair of pairs) {
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[pair[0]]);
      });
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[pair[1]]);
      });
      act(() => vi.advanceTimersByTime(260));
    }

    expect(screen.getByText('Round 1 complete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    expect(screen.getByText('Round 2/5')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(12);
  });

  it('uses preliminary totals only when final pair points are tied', () => {
    expect(chooseHouseOfCardsFinalWinner(
      ['alice', 'bob'],
      { alice: 7, bob: 6 },
      { alice: 100, bob: 900 },
    )).toBe('alice');
    expect(chooseHouseOfCardsFinalWinner(
      ['alice', 'bob'],
      { alice: 7, bob: 7 },
      { alice: 100, bob: 900 },
    )).toBe('bob');
  });
});
