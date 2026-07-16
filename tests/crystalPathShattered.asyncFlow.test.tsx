import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CrystalPathShatteredGame from '../src/minigames/crystalPathShattered/CrystalPathShatteredGame';
import {
  CATASTROPHE_STEP_MS,
  SAFE_STEP_MS,
  WRONG_STEP_MS,
  createRowStream,
} from '../src/minigames/crystalPathShattered/shatteredLogic';
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

  it('keeps the chosen row active during a non-lethal wrong-step crack, then advances', async () => {
    const seed = 12345;
    const [firstRow, secondRow] = createRowStream(mulberry32(seed)).take(2);
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left';

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

    const wrongTile = screen.getByRole('button', { name: `Row 1 ${wrongSide} tile` });
    const firstRowSafeTile = screen.getByRole('button', { name: `Row 1 ${firstRow.safeSide} tile` });
    const secondRowSafeTile = screen.getByRole('button', { name: `Row 2 ${secondRow.safeSide} tile` });

    fireEvent.click(wrongTile);

    expect(wrongTile.className).toContain('is-wrong');
    expect(wrongTile.className).toContain('is-cracked');
    expect(firstRowSafeTile.closest('.cps-row')?.className).toContain('is-current');
    expect(secondRowSafeTile.closest('.cps-row')?.className).not.toContain('is-current');
    expect(secondRowSafeTile).toHaveAttribute('disabled');

    await act(async () => {
      vi.advanceTimersByTime(WRONG_STEP_MS + 20);
    });

    expect(screen.getByText('290')).toBeTruthy();
    expect(screen.getByText('Row 2')).toBeTruthy();
    expect(firstRowSafeTile.closest('.cps-row')?.className).toContain('is-past');
    expect(secondRowSafeTile.closest('.cps-row')?.className).toContain('is-current');
    expect(secondRowSafeTile).not.toHaveAttribute('disabled');
  });

  it('marks a wrong tile as cracking immediately and leaves it cracked after resolution', async () => {
    const seed = 12345;
    const [firstRow] = createRowStream(mulberry32(seed)).take(1);
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left';

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

    const wrongTile = screen.getByRole('button', { name: `Row 1 ${wrongSide} tile` });
    fireEvent.click(wrongTile);

    expect(wrongTile.className).toContain('is-wrong');
    expect(wrongTile.className).toContain('is-cracked');

    await act(async () => {
      vi.advanceTimersByTime(WRONG_STEP_MS + 20);
    });

    expect(wrongTile.className).not.toContain('is-wrong');
    expect(wrongTile.className).toContain('is-cracked');
  });

  it('adds the catastrophe shell state when the human is eliminated on a wrong tile', async () => {
    const seed = 12345;
    const rows = createRowStream(mulberry32(seed)).take(24);

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

    for (const row of rows.slice(0, -1)) {
      const wrongSide = row.safeSide === 'left' ? 'right' : 'left';
      fireEvent.click(
        screen.getByRole('button', { name: `Row ${row.index + 1} ${wrongSide} tile` }),
      );

      await act(async () => {
        vi.advanceTimersByTime(CATASTROPHE_STEP_MS + 20);
      });
    }

    const finalRow = rows.at(-1);
    if (!finalRow) throw new Error('expected lethal row');
    const lethalSide = finalRow.safeSide === 'left' ? 'right' : 'left';

    fireEvent.click(
      screen.getByRole('button', { name: `Row ${finalRow.index + 1} ${lethalSide} tile` }),
    );

    expect(screen.getByLabelText('Crystal Path: Infinity').className).toContain('is-catastrophe');
  }, 10_000);

  it('shows the results as soon as the human run ends instead of switching to AI turns', async () => {
    const seed = 12345;
    const rows = createRowStream(mulberry32(seed)).take(40);

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

    for (const row of rows) {
      const wrongSide = row.safeSide === 'left' ? 'right' : 'left';
      fireEvent.click(
        screen.getByRole('button', { name: `Row ${row.index + 1} ${wrongSide} tile` }),
      );

      await act(async () => {
        vi.advanceTimersByTime(CATASTROPHE_STEP_MS + 20);
      });

      if (screen.queryByLabelText('Crystal Path: Infinity — complete')) break;
    }

    expect(screen.getByLabelText('Crystal Path: Infinity — complete')).toBeTruthy();
    expect(screen.getByLabelText('Final standings')).toBeTruthy();
    expect(screen.queryByText('AI One keeps climbing…')).toBeNull();
  }, 10_000);
});
