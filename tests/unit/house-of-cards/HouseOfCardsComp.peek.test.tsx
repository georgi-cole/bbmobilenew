import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp';
import houseOfCardsReducer from '../../../src/features/houseOfCards/houseOfCardsSlice';
import {
  buildHouseOfCardsBoard,
  PEEK_DURATION_MS,
} from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils';

function makeStore() {
  return configureStore({
    reducer: {
      houseOfCards: houseOfCardsReducer,
    },
  });
}

function renderGame(seed = 42) {
  const store = makeStore();
  const participants = [{ id: 'human', name: 'You', isHuman: true }];

  const utils = render(
    <Provider store={store}>
      <HouseOfCardsComp
        participantIds={['human']}
        participants={participants}
        prizeType="HOH"
        seed={seed}
      />
    </Provider>,
  );

  return { store, ...utils };
}

function getPairIndexes(seed: number): number[][] {
  const board = buildHouseOfCardsBoard(seed);
  const bySymbol = new Map<string, number[]>();

  for (const card of board) {
    const indexes = bySymbol.get(card.symbol) ?? [];
    indexes.push(card.index);
    bySymbol.set(card.symbol, indexes);
  }

  return [...bySymbol.values()];
}

function clickCell(index: number) {
  const cells = screen.getAllByRole('gridcell');
  fireEvent.click(cells[index]);
}

async function clickPair(pair: number[]) {
  await act(async () => {
    clickCell(pair[0]);
  });
  await act(async () => {
    clickCell(pair[1]);
  });
}

async function clickMismatch(firstIndex: number, secondIndex: number) {
  await act(async () => {
    clickCell(firstIndex);
  });
  await act(async () => {
    clickCell(secondIndex);
  });
}

describe('HouseOfCardsComp — peek effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers peek only after 2 consecutive matched pairs and hides after 1000ms', async () => {
    const seed = 42;
    const pairs = getPairIndexes(seed);

    renderGame(seed);
    await act(async () => {});

    await clickPair(pairs[0]);
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();

    await clickPair(pairs[1]);
    expect(screen.getByText(/peek!/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(PEEK_DURATION_MS - 1);
    });
    expect(screen.getByText(/peek!/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();
  });

  it('does not trigger after a broken streak and only fires once total', async () => {
    const seed = 42;
    const pairs = getPairIndexes(seed);

    renderGame(seed);
    await act(async () => {});

    await clickPair(pairs[0]);
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();

    await clickMismatch(pairs[1][0], pairs[2][0]);
    await act(async () => {
      vi.advanceTimersByTime(901);
    });

    await clickPair(pairs[1]);
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();

    await clickPair(pairs[2]);
    expect(screen.getByText(/peek!/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(PEEK_DURATION_MS);
    });
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();

    await clickPair(pairs[3]);
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();

    await clickPair(pairs[4]);
    expect(screen.queryByText(/peek!/i)).not.toBeInTheDocument();
  });
});
