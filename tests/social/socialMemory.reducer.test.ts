import { describe, it, expect } from 'vitest';
import socialReducer, { decaySocialMemory, updateSocialMemory } from '../../src/social/socialSlice';
import { socialConfig } from '../../src/social/socialConfig';
import type { SocialMemoryEvent, SocialState } from '../../src/social/types';

function makeEvent(type: string, timestamp: number): SocialMemoryEvent {
  return {
    type,
    actorId: 'ai1',
    targetId: 'user',
    week: 2,
    timestamp,
  };
}

describe('social memory reducer', () => {
  it('creates entries, applies deltas, and caps recent events', () => {
    const limit = socialConfig.socialMemoryConfig.recentEventsLimit;
    let state = socialReducer(undefined, { type: 'init' }) as SocialState;

    state = socialReducer(
      state,
      updateSocialMemory({
        actorId: 'ai1',
        targetId: 'user',
        deltas: { gratitude: 4, trustMomentum: 2 },
        event: makeEvent('accepted_alliance', 100),
      }),
    ) as SocialState;

    const entry = state.socialMemory.ai1.user;
    expect(entry.gratitude).toBe(4);
    expect(entry.trustMomentum).toBe(2);
    expect(entry.recentEvents).toHaveLength(1);

    for (let i = 0; i < limit + 2; i += 1) {
      state = socialReducer(
        state,
        updateSocialMemory({
          actorId: 'ai1',
          targetId: 'user',
          event: makeEvent(`event_${i}`, 200 + i),
        }),
      ) as SocialState;
    }

    const updatedEntry = state.socialMemory.ai1.user;
    expect(updatedEntry.recentEvents).toHaveLength(limit);
    expect(updatedEntry.recentEvents[0].type).toBe(`event_${limit + 1}`);
  });

  it('decays signals toward zero without crossing bounds', () => {
    let state = socialReducer(undefined, { type: 'init' }) as SocialState;
    state = socialReducer(
      state,
      updateSocialMemory({
        actorId: 'ai1',
        targetId: 'user',
        deltas: { gratitude: 2, resentment: 2, neglect: 2, trustMomentum: -3 },
      }),
    ) as SocialState;

    state = socialReducer(state, decaySocialMemory()) as SocialState;
    const entry = state.socialMemory.ai1.user;
    expect(entry.gratitude).toBe(1);
    expect(entry.resentment).toBe(1);
    expect(entry.neglect).toBe(1);
    expect(entry.trustMomentum).toBe(-1);
  });
});
