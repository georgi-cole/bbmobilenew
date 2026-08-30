import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/features/houseOfCards/houseOfCardsAi', () => ({
  createHouseOfCardsAiProfiles: (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { sessionAbility: 55 }])),
  simulateHouseOfCardsAiRound: () => ({ score: 9_999, mistakes: 0, timeMs: 1_000 }),
}));

import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp';
import { buildHouseOfCardsBoard } from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils';
import houseOfCardsReducer from '../../../src/features/houseOfCards/houseOfCardsSlice';

function pairIndexes(seed: number): number[][] {
  const bySymbol = new Map<string, number[]>();
  buildHouseOfCardsBoard(seed, 4).forEach((card) => {
    bySymbol.set(card.symbol, [...(bySymbol.get(card.symbol) ?? []), card.index]);
  });
  return [...bySymbol.values()];
}

describe('HouseOfCardsComp spectator skip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('takes an eliminated player directly to final results', async () => {
    const store = configureStore({
      reducer: {
        game: (state = { phase: 'loh_comp' }) => state,
        houseOfCards: houseOfCardsReducer,
      },
    });
    render(
      <Provider store={store}>
        <HouseOfCardsComp
          participantIds={['human', 'ai-one', 'ai-two']}
          participants={[
            { id: 'human', name: 'You', isHuman: true },
            { id: 'ai-one', name: 'AI One', isHuman: false },
            { id: 'ai-two', name: 'AI Two', isHuman: false },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    for (const [first, second] of pairIndexes(42)) {
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[first]);
      });
      await act(async () => {
        fireEvent.click(screen.getAllByRole('gridcell')[second]);
      });
      act(() => {
        vi.advanceTimersByTime(260);
      });
    }

    expect(screen.getByRole('button', { name: 'Skip to results' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip to results' }));

    expect(screen.getByLabelText('Final standings')).toBeInTheDocument();
    expect(screen.getByText(/wins House of Cards/)).toBeInTheDocument();
  });
});
