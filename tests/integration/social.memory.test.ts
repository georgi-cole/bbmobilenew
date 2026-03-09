import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import socialReducer, { pushIncomingInteraction } from '../../src/social/socialSlice';
import { respondToIncomingInteraction, autoResolveExpiredIncomingInteractionsForWeek } from '../../src/social/incomingInteractions';
import { socialConfig } from '../../src/social/socialConfig';
import type { IncomingInteraction } from '../../src/social/types';

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, social: socialReducer } });
}

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'i-1',
    fromId: 'ai1',
    type: 'compliment',
    text: 'Nice move.',
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  };
}

describe('social memory integration for incoming interactions', () => {
  it('updates memory on manual interaction response', () => {
    const store = makeStore();
    const { players, week } = store.getState().game;
    const human = players.find((p) => p.isUser)!;
    const ai = players.find((p) => !p.isUser)!;

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({
          id: 'i-1',
          fromId: ai.id,
          createdWeek: week,
          expiresAtWeek: week + 1,
        }),
      ),
    );
    store.dispatch(respondToIncomingInteraction({ interactionId: 'i-1', responseType: 'positive' }) as never);

    const entry = store.getState().social.socialMemory[ai.id][human.id];
    const expected = socialConfig.socialMemoryConfig.incomingInteractionDeltas.positive.gratitude;
    expect(entry.gratitude).toBe(expected);
    expect(entry.recentEvents[0].type).toBe('appreciated_compliment');
  });

  it('records neglect when interactions expire at week end', () => {
    const store = makeStore();
    const { players, week } = store.getState().game;
    const human = players.find((p) => p.isUser)!;
    const ai = players.find((p) => !p.isUser)!;

    store.dispatch(
      pushIncomingInteraction(
        makeInteraction({ id: 'i-expired', fromId: ai.id, createdWeek: week, expiresAtWeek: week }),
      ),
    );

    store.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week + 1) as never);

    const entry = store.getState().social.socialMemory[ai.id][human.id];
    const expected = socialConfig.socialMemoryConfig.incomingInteractionDeltas.ignore.neglect;
    expect(entry.neglect).toBe(expected);
    expect(entry.recentEvents[0].type).toBe('ignored_compliment');
  });
});
