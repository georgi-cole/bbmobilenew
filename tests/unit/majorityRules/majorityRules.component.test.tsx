import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer, {
  advanceIntro,
  type MajorityRulesState,
  setHumanAnswer,
} from '../../../src/features/majorityRules/majorityRulesSlice';
import { MAJORITY_RULES_QUESTIONS } from '../../../src/features/majorityRules/helpers';
import MajorityRulesComp from '../../../src/components/MajorityRulesComp/MajorityRulesComp';

function buildPlayer(id: string, name: string, isUser = false) {
  return { id, name, avatar: '', status: 'active', isUser };
}

function makeStore(
  players = [
    buildPlayer('user', 'You', true),
    buildPlayer('finn', 'Finn'),
    buildPlayer('mimi', 'Mimi'),
    buildPlayer('rae', 'Rae'),
  ],
  initialMajorityRules?: MajorityRulesState,
) {
  const gameReducer = (
    state = {
      players,
      phase: 'loh_comp',
    },
  ) => state;

  const majorityReducer = (state: MajorityRulesState | undefined, action: { type: string }) => {
    if (initialMajorityRules && state && action.type === 'majorityRules/initMajorityRules') {
      return state;
    }
    return majorityRulesReducer(state, action);
  };

  return configureStore({
    reducer: {
      majorityRules: majorityReducer,
      game: gameReducer,
    },
    preloadedState: initialMajorityRules ? { majorityRules: initialMajorityRules } : undefined,
  });
}

describe('MajorityRulesComp', () => {
  it('uses live houseguest names and avatar candidates when participant ids match game players', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={['user', 'finn', 'mimi', 'rae']}
          participants={[
            { id: 'user', name: 'PLAYER_1', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'finn', name: 'PLAYER_2', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'mimi', name: 'PLAYER_3', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'rae', name: 'PLAYER_4', isHuman: false, precomputedScore: 0, previousPR: null },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(screen.getByText('Finn')).toBeInTheDocument();
    expect(screen.getByText('Mimi')).toBeInTheDocument();
    expect(screen.getByText('Rae')).toBeInTheDocument();

    const finnPortrait = screen.getAllByTestId('mr-portrait-finn')[0];
    expect(finnPortrait.getAttribute('src')).toContain('assets/skins/backup-grey-lux/Finn_avatar.webp');
  });

  it('switches to a compact avatar rail when the roster is large', async () => {
    const ids = ['user', ...Array.from({ length: 11 }, (_, playerNumber) => `p${playerNumber + 2}`)];
    const players = ids.map((id, index) => buildPlayer(id, index === 0 ? 'You' : `AI_${index}`, index === 0));
    const store = makeStore(players);

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={ids}
          participants={ids.map((id, index) => ({
            id,
            name: index === 0 ? 'USER' : `AI_${index}`,
            isHuman: index === 0,
            precomputedScore: 0,
            previousPR: null,
          }))}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(screen.getByTestId('mr-avatar-rail')).toHaveClass('majority-rules-avatar-rail--wrapped');
    expect(screen.getByTestId('mr-avatar-rail-item-user')).toBeInTheDocument();
    expect(screen.getByTestId('mr-avatar-rail-item-p12')).toBeInTheDocument();
  });

  it('keeps the intro card visible for five seconds before advancing', async () => {
    vi.useFakeTimers();
    const store = makeStore();

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={['user', 'finn', 'mimi', 'rae']}
          participants={[
            { id: 'user', name: 'PLAYER_1', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'finn', name: 'PLAYER_2', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'mimi', name: 'PLAYER_3', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'rae', name: 'PLAYER_4', isHuman: false, precomputedScore: 0, previousPR: null },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(screen.getByText('Majority Rules')).toBeInTheDocument();
    expect(store.getState().majorityRules.phase).toBe('intro');

    act(() => {
      vi.advanceTimersByTime(4999);
    });

    expect(store.getState().majorityRules.phase).toBe('intro');
    expect(screen.getByText('Majority Rules')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(store.getState().majorityRules.phase).toBe('question');

    vi.useRealTimers();
  });

  it('does not reinitialize when parent rerenders pass new participant array references', async () => {
    const store = makeStore();
    const participantIds = ['user', 'finn', 'mimi', 'rae'];
    const participants = [
      { id: 'user', name: 'PLAYER_1', isHuman: true, precomputedScore: 0, previousPR: null },
      { id: 'finn', name: 'PLAYER_2', isHuman: false, precomputedScore: 0, previousPR: null },
      { id: 'mimi', name: 'PLAYER_3', isHuman: false, precomputedScore: 0, previousPR: null },
      { id: 'rae', name: 'PLAYER_4', isHuman: false, precomputedScore: 0, previousPR: null },
    ];

    const { rerender } = render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={participantIds}
          participants={participants}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    act(() => {
      store.dispatch(advanceIntro());
    });

    const chosenOptionId = store.getState().majorityRules.currentQuestion?.options[0]?.id;
    expect(chosenOptionId).toBeTruthy();

    act(() => {
      store.dispatch(setHumanAnswer({ playerId: 'user', optionId: chosenOptionId! }));
    });

    expect(store.getState().majorityRules.draftAnswers.user).toBe(chosenOptionId);

    rerender(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={[...participantIds]}
          participants={participants.map((participant) => ({ ...participant }))}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(store.getState().majorityRules.phase).toBe('question');
    expect(store.getState().majorityRules.draftAnswers.user).toBe(chosenOptionId);
  });

  it('pauses after elimination and resumes normal timing when the user continues watching', async () => {
    vi.useFakeTimers();
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = makeStore(undefined, {
      phase: 'reveal',
      competitionType: 'LOH',
      seed: 42,
      participantIds: ['user', 'finn', 'mimi', 'rae', 'zoe'],
      activeIds: ['finn', 'mimi', 'rae', 'zoe'],
      eliminatedIds: ['user'],
      humanPlayerId: 'user',
      roundNumber: 1,
      revoteNumber: 0,
      currentQuestion: question,
      usedQuestionIds: [question.id],
      draftAnswers: {},
      previousDistribution: null,
      blockedAnswers: {},
      doubleEliminationArmed: false,
      hintInventories: {},
      roundHintUsedBy: null,
      roundHintType: null,
      roundHintTargetId: null,
      roundHintPollEstimate: null,
      roundHintPeekedAnswers: null,
      revealState: {
        result: {
          kind: 'elimination',
          distribution: { a: 3, b: 1, c: 1 },
          answers: { user: 'c', finn: 'a', mimi: 'a', rae: 'b', zoe: 'a' },
          eliminatedIds: ['user', 'rae'],
          minorityOptionId: null,
          tiedOptionIds: ['b', 'c'],
          eliminationCount: 1,
        },
        revoteNumber: 0,
      },
      threeWayDuel: null,
      finalDuel: null,
      winnerId: null,
      outcomeResolved: false,
    });

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={['user', 'finn', 'mimi', 'rae']}
          participants={[
            { id: 'user', name: 'PLAYER_1', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'finn', name: 'PLAYER_2', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'mimi', name: 'PLAYER_3', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'rae', name: 'PLAYER_4', isHuman: false, precomputedScore: 0, previousPR: null },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});
    expect(store.getState().majorityRules.phase).toBe('reveal');
    expect(screen.getByLabelText('Vote aggregation')).toBeInTheDocument();
    expect(screen.getByText('Majority · 3/5 (60%)')).toBeInTheDocument();
    expect(screen.getAllByText('Minority · 1/5 (20%)')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Continue watching' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip to results' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(store.getState().majorityRules.phase).toBe('reveal');

    fireEvent.click(screen.getByRole('button', { name: 'Continue watching' }));

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(store.getState().majorityRules.phase).toBe('reveal');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(store.getState().majorityRules.phase).toBe('question');
    vi.useRealTimers();
  });

  it('fast-forwards the existing game state when the eliminated user skips to results', async () => {
    vi.useFakeTimers();
    const question = MAJORITY_RULES_QUESTIONS[0];
    const store = makeStore(undefined, {
      phase: 'question',
      competitionType: 'LOH',
      seed: 42,
      participantIds: ['user', 'finn', 'mimi', 'rae'],
      activeIds: ['finn', 'mimi', 'rae'],
      eliminatedIds: ['user'],
      humanPlayerId: 'user',
      roundNumber: 12,
      revoteNumber: 0,
      currentQuestion: question,
      usedQuestionIds: [question.id],
      draftAnswers: {},
      previousDistribution: null,
      blockedAnswers: {},
      doubleEliminationArmed: false,
      hintInventories: {},
      roundHintUsedBy: null,
      roundHintType: null,
      roundHintTargetId: null,
      roundHintPollEstimate: null,
      roundHintPeekedAnswers: null,
      revealState: null,
      threeWayDuel: null,
      finalDuel: null,
      winnerId: null,
      outcomeResolved: false,
    });

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={['user', 'finn', 'mimi', 'rae']}
          participants={[
            { id: 'user', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'finn', name: 'Finn', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'mimi', name: 'Mimi', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'rae', name: 'Rae', isHuman: false, precomputedScore: 0, previousPR: null },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Skip to results' }));
    expect(screen.getByRole('status')).toHaveTextContent('Fast-forwarding the live game');

    act(() => vi.advanceTimersByTime(24));
    expect(store.getState().majorityRules.phase).toBe('question');
    act(() => vi.advanceTimersByTime(1));
    expect(store.getState().majorityRules.phase).toBe('reveal');
    expect(store.getState().majorityRules.roundNumber).toBe(12);
    expect(store.getState().majorityRules.currentQuestion?.id).toBe(question.id);
    vi.useRealTimers();
  });

  it('keeps the winner screen manual even after the spectator auto-advance timeout', async () => {
    vi.useFakeTimers();
    const store = makeStore(undefined, {
      phase: 'winner',
      competitionType: 'LOH',
      seed: 42,
      participantIds: ['user', 'finn', 'mimi', 'rae'],
      activeIds: ['finn'],
      eliminatedIds: ['user', 'mimi', 'rae'],
      humanPlayerId: 'user',
      roundNumber: 3,
      revoteNumber: 0,
      currentQuestion: null,
      usedQuestionIds: [],
      draftAnswers: {},
      previousDistribution: null,
      blockedAnswers: {},
      doubleEliminationArmed: false,
      hintInventories: {},
      roundHintUsedBy: null,
      roundHintType: null,
      roundHintTargetId: null,
      roundHintPollEstimate: null,
      roundHintPeekedAnswers: null,
      revealState: null,
      threeWayDuel: null,
      finalDuel: null,
      winnerId: 'finn',
      outcomeResolved: false,
    });

    render(
      <Provider store={store}>
        <MajorityRulesComp
          participantIds={['user', 'finn', 'mimi', 'rae']}
          participants={[
            { id: 'user', name: 'PLAYER_1', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'finn', name: 'PLAYER_2', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'mimi', name: 'PLAYER_3', isHuman: false, precomputedScore: 0, previousPR: null },
            { id: 'rae', name: 'PLAYER_4', isHuman: false, precomputedScore: 0, previousPR: null },
          ]}
          prizeType="LOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(store.getState().majorityRules.phase).toBe('winner');
    expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument();
    vi.useRealTimers();
  });
});
