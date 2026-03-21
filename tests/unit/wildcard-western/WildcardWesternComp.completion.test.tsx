import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WildcardWesternComp from '../../../src/components/WildcardWesternComp/WildcardWesternComp';
import wildcardWesternReducer, {
  initWildcardWestern,
  resetWildcardWestern,
  type WildcardWesternState,
} from '../../../src/features/wildcardWestern/wildcardWesternSlice';
import { WILDCARD_QUESTIONS } from '../../../src/features/wildcardWestern/wildcardWesternQuestions';

const { resolveWildcardWesternOutcomeMock } = vi.hoisted(() => ({
  resolveWildcardWesternOutcomeMock: vi.fn(() => ({ type: 'wildcardWestern/resolveMock' })),
}));

vi.mock('../../../src/features/wildcardWestern/thunks', () => ({
  resolveWildcardWesternOutcome: resolveWildcardWesternOutcomeMock,
}));

const PARTICIPANTS = [
  { id: 'p0', name: 'Dex', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'p1', name: 'AI-1', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'p2', name: 'AI-2', isHuman: false, precomputedScore: 0, previousPR: null },
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

function renderWithLiveWildcardReducer({
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
      wildcardWestern: (state: WildcardWesternState | undefined, action) => {
        if (state === undefined) return wildcardWesternState;
        if (action.type === initWildcardWestern.type || action.type === resetWildcardWestern.type) {
          return state;
        }
        if (action.type === 'wildcardWestern/resolveMock') {
          return { ...state, outcomeResolved: true };
        }
        return wildcardWesternReducer(state, action);
      },
      game: (state = { phase: gamePhase }) => state,
    },
  });

  const view = render(
    <Provider store={store}>
      <WildcardWesternComp
        participantIds={wildcardWesternState.participantIds}
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

  it('shows spectator choices for an eliminated human and auto-advances after continue watching', () => {
    vi.useFakeTimers();
    const question = WILDCARD_QUESTIONS[0];
    const { store } = renderWithLiveWildcardReducer({
      gamePhase: 'hoh_comp',
      wildcardWesternState: makeWildcardWesternState({
        phase: 'resolution',
        participantIds: ['p0', 'p1', 'p2'],
        aliveIds: ['p1', 'p2'],
        eliminatedIds: ['p0'],
        humanPlayerId: 'p0',
        currentPair: ['p0', 'p1'],
        currentQuestionId: question.id,
        selectedAnswerIndex: question.correctIndex,
        lastDuelOutcome: 'wrong',
        lastEliminatedId: 'p0',
        winnerId: null,
        controllerId: 'p1',
        eliminationChooserId: null,
      }),
    });

    expect(screen.getByRole('dialog', { name: /spectator options/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }));

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(store.getState().wildcardWestern.phase).toBe('finalDuel');
    expect(screen.queryByRole('dialog', { name: /spectator options/i })).toBeNull();
  });

  it('fast-forwards to the endgame after skip to results', async () => {
    vi.useFakeTimers();
    const question = WILDCARD_QUESTIONS[0];
    const { store } = renderWithLiveWildcardReducer({
      gamePhase: 'hoh_comp',
      wildcardWesternState: makeWildcardWesternState({
        phase: 'resolution',
        participantIds: ['p0', 'p1', 'p2'],
        aliveIds: ['p1'],
        eliminatedIds: ['p0', 'p2'],
        humanPlayerId: 'p0',
        currentPair: ['p0', 'p1'],
        currentQuestionId: question.id,
        selectedAnswerIndex: question.correctIndex,
        lastDuelOutcome: 'wrong',
        lastEliminatedId: 'p0',
        winnerId: null,
        controllerId: 'p1',
        eliminationChooserId: null,
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /skip to results/i }));

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(resolveWildcardWesternOutcomeMock).toHaveBeenCalled();
    expect(store.getState().wildcardWestern.phase).toBe('gameOver');
    expect(store.getState().wildcardWestern.winnerId).toBe('p1');
  });
});
