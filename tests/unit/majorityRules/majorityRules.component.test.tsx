import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import majorityRulesReducer from '../../../src/features/majorityRules/majorityRulesSlice';
import MajorityRulesComp from '../../../src/components/MajorityRulesComp/MajorityRulesComp';

function makeStore() {
  const gameReducer = (
    state = {
      players: [
        { id: 'user', name: 'You', avatar: '😀', status: 'active', isUser: true },
        { id: 'finn', name: 'Finn', avatar: '', status: 'active' },
        { id: 'mimi', name: 'Mimi', avatar: '', status: 'active' },
        { id: 'rae', name: 'Rae', avatar: '', status: 'active' },
      ],
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
});
