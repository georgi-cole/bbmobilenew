import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer, {
  advanceIntro,
  setHumanAnswer,
} from '../../../src/features/majorityRules/majorityRulesSlice';
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
) {
  const gameReducer = (
    state = {
      players,
      phase: 'hoh_comp',
    },
  ) => state;

  return configureStore({
    reducer: {
      majorityRules: majorityRulesReducer,
      game: gameReducer,
    },
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
          prizeType="HOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(screen.getByText('Finn')).toBeInTheDocument();
    expect(screen.getByText('Mimi')).toBeInTheDocument();
    expect(screen.getByText('Rae')).toBeInTheDocument();

    const finnPortrait = screen.getAllByTestId('mr-portrait-finn')[0];
    expect(finnPortrait.getAttribute('src')).toContain('avatars/Finn.png');
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
          prizeType="HOH"
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
          prizeType="HOH"
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
          prizeType="HOH"
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
          prizeType="HOH"
          seed={42}
        />
      </Provider>,
    );

    await act(async () => {});

    expect(store.getState().majorityRules.phase).toBe('question');
    expect(store.getState().majorityRules.draftAnswers.user).toBe(chosenOptionId);
  });
});
