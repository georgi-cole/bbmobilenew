import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import HouseOfCardsComp from '../../../src/components/HouseOfCardsComp/HouseOfCardsComp';
import {
  finaliseOutcome,
  TOTAL_PAIRS,
} from '../../../src/features/houseOfCards/houseOfCardsSlice';
import houseOfCardsReducer from '../../../src/features/houseOfCards/houseOfCardsSlice';
import {
  buildHouseOfCardsBoard,
  PEEK_DURATION_MS,
} from '../../../src/components/HouseOfCardsComp/houseOfCardsUtils';

function makeStore() {
  return configureStore({
    reducer: {
      game: (state = { phase: 'loh_comp' }) => state,
      houseOfCards: houseOfCardsReducer,
    },
  });
}

function renderGame(
  seed = 42,
  participants = [{ id: 'human', name: 'You', isHuman: true }],
) {
  const store = makeStore();
  const participantIds = participants.map((participant) => participant.id);

  const utils = render(
    <Provider store={store}>
      <HouseOfCardsComp
        participantIds={participantIds}
        participants={participants}
        prizeType="LOH"
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

  it('renders a native-styled final scoreboard without emoji rank glyphs', async () => {
    const seed = 42;
    const { store } = renderGame(seed, [
      { id: 'human', name: 'Finn', isHuman: true },
      { id: 'zed', name: 'Zed', isHuman: false },
      { id: 'vee', name: 'Vee', isHuman: false },
    ]);
    await act(async () => {
      store.dispatch(
        finaliseOutcome({
          matchedPairs: TOTAL_PAIRS,
          mistakes: 0,
          turnsTaken: TOTAL_PAIRS,
          completionTimeMs: 15_000,
          streakBest: 4,
          humanId: 'human',
        }),
      );
    });

    expect(screen.getByText('House of Cards')).toBeInTheDocument();
    expect(screen.getByText('You Win!')).toBeInTheDocument();
    expect(screen.getByText('Continue ▶')).toHaveClass('hoc-complete-continue');
    const winnerRow = screen.getByLabelText('Rank 1').closest('li') as HTMLElement;
    expect(screen.getByLabelText('Rank 1')).toHaveTextContent('1');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(within(winnerRow).getByText('Finn')).toBeInTheDocument();
    expect(within(winnerRow).getByText(/10\/10 pairs · 0 misses/i)).toBeInTheDocument();
    expect(screen.queryByText('🥇')).not.toBeInTheDocument();
    expect(screen.queryByText('4️⃣')).not.toBeInTheDocument();
  });
});
