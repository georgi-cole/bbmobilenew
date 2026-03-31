import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer from '../../../src/features/majorityRules/majorityRulesSlice';
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
    const ids = ['user', ...Array.from({ length: 11 }, (_, index) => `p${index + 2}`)];
    const players = ids.map((id, index) => buildPlayer(id, index === 0 ? 'You' : `Player ${index + 1}`, index === 0));
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

    expect(screen.getByTestId('mr-avatar-rail')).toBeInTheDocument();
    expect(screen.getByTestId('mr-avatar-rail-item-user')).toBeInTheDocument();
    expect(screen.getByTestId('mr-avatar-rail-item-p12')).toBeInTheDocument();
  });
});
