import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import MinigameHost from '../src/components/MinigameHost/MinigameHost';
import { getGame } from '../src/minigames/registry';

const hangmanComponentSpy = vi.fn();

vi.mock('../src/components/HangmanChallengeComp/HangmanChallengeComp', () => ({
  default: (props: { participants?: Array<{ id: string }>; participantIds?: string[] }) => {
    hangmanComponentSpy(props);
    return <div data-testid="hangman-react-game">Hangman React Game</div>;
  },
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

describe('MinigameHost — hangman routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hangmanComponentSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the migrated React hangman game and forwards participants', async () => {
    const store = makeStore();
    const game = getGame('hangman');

    render(
      <Provider store={store}>
        <MinigameHost
          game={game}
          gameOptions={{ seed: 42 }}
          participants={[
            { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'ai-1', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
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

    expect(screen.getByTestId('hangman-react-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(hangmanComponentSpy).toHaveBeenCalled();
    expect(hangmanComponentSpy.mock.calls[0][0].participants).toHaveLength(2);
  });

  it('registers hangman as an authoritative React implementation', () => {
    const game = getGame('hangman');
    expect(game.title).toBe('Verdict Board');
    expect(game.implementation).toBe('react');
    expect(game.reactComponentKey).toBe('HangmanChallenge');
    expect(game.legacy).toBe(false);
    expect(game.scoringAdapter).toBe('authoritative');
  });
});
