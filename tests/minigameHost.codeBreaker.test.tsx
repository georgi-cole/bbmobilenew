import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import MinigameHost from '../src/components/MinigameHost/MinigameHost';
import { getGame } from '../src/minigames/registry';

const codeBreakerComponentSpy = vi.fn();

vi.mock('../src/components/CodeBreakerComp/CodeBreakerComp', () => ({
  default: (props: {
    onComplete?: () => void;
    onFinish?: (value: number) => void;
    participants?: Array<{ id: string }>;
    participantIds?: string[];
  }) => {
    codeBreakerComponentSpy(props);
    return <div data-testid="codebreaker-react-game">CodeBreaker React Game</div>;
  },
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

describe('MinigameHost — Vault Cracker routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    codeBreakerComponentSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Vault Cracker with onComplete so its internal scoreboard can be shown first', async () => {
    const store = makeStore();
    const game = getGame('logicLocks');

    render(
      <Provider store={store}>
        <MinigameHost
          game={game}
          gameOptions={{ seed: 42, prizeType: 'LOH' }}
          participants={[
            { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'ai-1', name: 'Cipher', isHuman: false, precomputedScore: 0, previousPR: null },
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

    expect(screen.getByTestId('codebreaker-react-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(codeBreakerComponentSpy).toHaveBeenCalled();
    expect(codeBreakerComponentSpy.mock.calls[0][0].participants).toHaveLength(2);
    expect(codeBreakerComponentSpy.mock.calls[0][0].participantIds).toEqual(['human', 'ai-1']);
    expect(codeBreakerComponentSpy.mock.calls[0][0].onComplete).toEqual(expect.any(Function));
    expect(codeBreakerComponentSpy.mock.calls[0][0].onFinish).toBeUndefined();
  });
});
