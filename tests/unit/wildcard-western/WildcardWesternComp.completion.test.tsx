import { render } from '@testing-library/react';
import { act } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WildcardWesternComp from '../../../src/components/WildcardWesternComp/WildcardWesternComp';
import type { WildcardWesternState } from '../../../src/features/wildcardWestern/wildcardWesternSlice';

const { resolveWildcardWesternOutcomeMock } = vi.hoisted(() => ({
  resolveWildcardWesternOutcomeMock: vi.fn(() => ({ type: 'wildcardWestern/resolveMock' })),
}));

vi.mock('../../../src/features/wildcardWestern/thunks', () => ({
  resolveWildcardWesternOutcome: resolveWildcardWesternOutcomeMock,
}));

const PARTICIPANTS = [
  { id: 'p0', name: 'Dex', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'p1', name: 'AI-1', isHuman: false, precomputedScore: 0, previousPR: null },
];

function makeWildcardWesternState(
  overrides: Partial<WildcardWesternState> = {},
): WildcardWesternState {
  return {
    phase: 'gameOver',
    prizeType: 'HOH',
    seed: 123,
    duelNumber: 4,
    participantIds: ['p0', 'p1'],
    aliveIds: ['p0'],
    eliminatedIds: ['p1'],
    humanPlayerId: 'p0',
    cardsByPlayerId: { p0: 88, p1: 11 },
    currentPair: ['p0', 'p1'],
    duelResolved: true,
    currentQuestionId: null,
    questionOrder: [],
    questionCursor: 0,
    buzzedBy: 'p0',
    buzzWindowUntil: 0,
    answerWindowUntil: 0,
    selectedAnswerIndex: 1,
    controllerId: 'p0',
    eliminationChooserId: 'p0',
    lastDuelOutcome: 'correct',
    lastEliminatedId: 'p1',
    winnerId: 'p0',
    outcomeResolved: false,
    ...overrides,
  };
}

function renderComponent({
  gamePhase,
  wildcardWesternState,
  onComplete = vi.fn(),
}: {
  gamePhase: string;
  wildcardWesternState: WildcardWesternState;
  onComplete?: ReturnType<typeof vi.fn>;
}) {
  const store = configureStore({
    reducer: {
      wildcardWestern: (state: WildcardWesternState = wildcardWesternState) => state,
      game: (state = { phase: gamePhase }) => state,
    },
  });

  const view = render(
    <Provider store={store}>
      <WildcardWesternComp
        participantIds={PARTICIPANTS.map((p) => p.id)}
        participants={PARTICIPANTS}
        onComplete={onComplete}
      />
    </Provider>,
  );

  return { ...view, onComplete, store };
}

describe('WildcardWesternComp completion flow', () => {
  beforeEach(() => {
    resolveWildcardWesternOutcomeMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves hosted HOH runs through the outcome thunk before notifying completion', async () => {
    const { onComplete } = renderComponent({
      gamePhase: 'hoh_comp',
      wildcardWesternState: makeWildcardWesternState({ outcomeResolved: false }),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(resolveWildcardWesternOutcomeMock).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports hosted completion only after outcomeResolved is already true', async () => {
    vi.useFakeTimers();
    const { onComplete } = renderComponent({
      gamePhase: 'hoh_comp',
      wildcardWesternState: makeWildcardWesternState({ outcomeResolved: true }),
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onComplete).toHaveBeenCalledWith({ authoritativeWinnerId: 'p0' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(resolveWildcardWesternOutcomeMock).not.toHaveBeenCalled();
  });

  it('does not report hosted completion more than once after a re-render', async () => {
    vi.useFakeTimers();
    const { onComplete, rerender, store } = renderComponent({
      gamePhase: 'hoh_comp',
      wildcardWesternState: makeWildcardWesternState({ outcomeResolved: true }),
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);

    rerender(
      <Provider store={store}>
        <WildcardWesternComp
          participantIds={PARTICIPANTS.map((p) => p.id)}
          participants={PARTICIPANTS}
          onComplete={onComplete}
        />
      </Provider>,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(resolveWildcardWesternOutcomeMock).not.toHaveBeenCalled();
  });
});
