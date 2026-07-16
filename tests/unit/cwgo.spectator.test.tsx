import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import ClosestWithoutGoingOverComp from '../../src/components/ClosestWithoutGoingOverComp';
import cwgoReducer, {
  revealMassResults,
  setGuesses,
  startCwgoCompetition,
  type CwgoState,
} from '../../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../../src/features/cwgo/cwgoQuestions';

describe("Don't Go Over spectator choice", () => {
  it('offers spectator or exit after the human confirms their elimination', () => {
    const participantIds = ['human', 'ai-1', 'ai-2', 'ai-3'];
    let state = cwgoReducer(undefined, startCwgoCompetition({ participantIds, prizeType: 'LOH', seed: 42 }));
    const answer = CWGO_QUESTIONS[state.questionIdx].answer;
    state = cwgoReducer(state, setGuesses({
      human: answer + 1,
      'ai-1': answer,
      'ai-2': Math.max(0, answer - 1),
      'ai-3': Math.max(0, answer - 2),
    }));
    state = cwgoReducer(state, revealMassResults());
    expect(state.lastEliminated).toContain('human');

    const reducer = (current: CwgoState | undefined, action: { type: string }) => {
      if (current && (action.type === 'cwgo/startCwgoCompetition' || action.type === 'cwgo/resetCwgo')) return current;
      return cwgoReducer(current, action);
    };
    const store = configureStore({
      reducer: {
        cwgo: reducer,
        game: (current = {
          players: [
            { id: 'human', name: 'You', avatar: '', isUser: true },
            { id: 'ai-1', name: 'Lia', avatar: '' },
            { id: 'ai-2', name: 'Finn', avatar: '' },
            { id: 'ai-3', name: 'Vee', avatar: '' },
          ],
        }) => current,
      },
      preloadedState: { cwgo: state },
    });

    render(
      <Provider store={store}>
        <ClosestWithoutGoingOverComp participantIds={participantIds} prizeType="LOH" seed={42} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog', { name: 'How would you like to continue?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue as spectator' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit game' })).toBeInTheDocument();
  });
});
