import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import MinigameHost from '../src/components/MinigameHost/MinigameHost';
import { getGame } from '../src/minigames/registry';

const numberTriviaSpy = vi.fn();

vi.mock('../src/components/NumberTrivia/NumberTrivia', () => ({
  default: (props: { participants?: Array<{ id: string }>; participantIds?: string[] }) => {
    numberTriviaSpy(props);
    return <div data-testid="number-trivia-react-game">Number Trivia React Game</div>;
  },
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

describe('MinigameHost — number trivia routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    numberTriviaSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the migrated React Number Trivia game and forwards participants', async () => {
    const store = makeStore();
    const game = getGame('threeDigitsQuiz');

    render(
      <Provider store={store}>
        <MinigameHost
          game={game}
          gameOptions={{ seed: 42 }}
          participants={[
            { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'ai-1', name: 'Nova', isHuman: false, precomputedScore: 48, previousPR: null },
          ]}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('number-trivia-react-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(numberTriviaSpy).toHaveBeenCalled();
    expect(numberTriviaSpy.mock.calls[0][0].participants).toHaveLength(2);
  });

  it('registers Number Trivia as a React implementation', () => {
    const game = getGame('threeDigitsQuiz');
    expect(game.title).toBe('Number Trivia');
    expect(game.implementation).toBe('react');
    expect(game.reactComponentKey).toBe('NumberTrivia');
    expect(game.legacy).toBe(false);
  });
});
