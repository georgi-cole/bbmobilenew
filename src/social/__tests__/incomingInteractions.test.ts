import { describe, it, expect } from 'vitest';
import socialReducer, {
  pushIncomingInteraction,
  markIncomingInteractionRead,
  markAllIncomingInteractionsRead,
  resolveIncomingInteraction,
  resolveExpiredIncomingInteractionsForWeek,
  selectActiveIncomingInteractions,
  selectIncomingInteractions,
  selectPendingIncomingInteractionCount,
  selectUnreadIncomingInteractionCount,
} from '../socialSlice';
import type { IncomingInteraction, SocialState } from '../types';

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'i-1',
    fromId: 'p2',
    type: 'compliment',
    text: 'Great job today.',
    createdAt: 100,
    createdWeek: 2,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  };
}

function reduce(state: SocialState | undefined, action: ReturnType<typeof pushIncomingInteraction>) {
  return socialReducer(state, action) as SocialState;
}

describe('socialSlice incoming interactions', () => {
  it('pushIncomingInteraction adds newest interactions first', () => {
    let state = socialReducer(undefined, { type: 'init' }) as SocialState;
    state = reduce(state, pushIncomingInteraction(makeInteraction({ id: 'i-1' })));
    state = reduce(state, pushIncomingInteraction(makeInteraction({ id: 'i-2', createdAt: 200 })));
    expect(state.incomingInteractions[0]?.id).toBe('i-2');
    expect(state.incomingInteractions).toHaveLength(2);
  });

  it('markIncomingInteractionRead marks a single interaction as read', () => {
    const initial = reduce(undefined, pushIncomingInteraction(makeInteraction()));
    const updated = socialReducer(initial, markIncomingInteractionRead('i-1')) as SocialState;
    expect(updated.incomingInteractions[0]?.read).toBe(true);
  });

  it('markAllIncomingInteractionsRead marks all interactions as read', () => {
    const initial = socialReducer(undefined, { type: 'init' }) as SocialState;
    const seeded = reduce(
      reduce(initial, pushIncomingInteraction(makeInteraction({ id: 'i-1' }))),
      pushIncomingInteraction(makeInteraction({ id: 'i-2', read: false })),
    );
    const updated = socialReducer(seeded, markAllIncomingInteractionsRead()) as SocialState;
    expect(updated.incomingInteractions.every((entry) => entry.read)).toBe(true);
  });

  it('resolveIncomingInteraction marks resolved state and metadata', () => {
    const initial = reduce(undefined, pushIncomingInteraction(makeInteraction()));
    const resolved = socialReducer(
      initial,
      resolveIncomingInteraction({
        interactionId: 'i-1',
        resolvedWith: 'positive',
        resolvedAt: 555,
        resolvedWeek: 2,
      }),
    ) as SocialState;
    const entry = resolved.incomingInteractions[0];
    expect(entry?.resolved).toBe(true);
    expect(entry?.resolvedWith).toBe('positive');
    expect(entry?.resolvedAt).toBe(555);
    expect(entry?.resolvedWeek).toBe(2);
    expect(entry?.read).toBe(true);
  });

  it('selectors compute unread and pending counts', () => {
    const state = socialReducer(undefined, { type: 'init' }) as SocialState;
    const seeded = reduce(
      reduce(state, pushIncomingInteraction(makeInteraction({ id: 'i-1', read: false }))),
      pushIncomingInteraction(makeInteraction({ id: 'i-2', resolved: true, read: true })),
    );
    const wrapped = { social: seeded };
    expect(selectIncomingInteractions(wrapped)).toHaveLength(2);
    expect(selectUnreadIncomingInteractionCount(wrapped)).toBe(1);
    expect(selectPendingIncomingInteractionCount(wrapped)).toBe(1);
    expect(selectActiveIncomingInteractions(wrapped)).toHaveLength(1);
  });

  it('resolveExpiredIncomingInteractionsForWeek resolves expired interactions', () => {
    const initial = socialReducer(undefined, { type: 'init' }) as SocialState;
    const seeded = reduce(
      reduce(initial, pushIncomingInteraction(makeInteraction({ id: 'i-1', expiresAtWeek: 1 }))),
      pushIncomingInteraction(makeInteraction({ id: 'i-2', expiresAtWeek: 4 })),
    );
    const updated = socialReducer(
      seeded,
      resolveExpiredIncomingInteractionsForWeek({ week: 3, resolvedAt: 900 }),
    ) as SocialState;
    const expired = updated.incomingInteractions.find((entry) => entry.id === 'i-1');
    const active = updated.incomingInteractions.find((entry) => entry.id === 'i-2');
    expect(expired?.resolved).toBe(true);
    expect(expired?.resolvedWith).toBe('ignore');
    expect(expired?.resolvedAt).toBe(900);
    expect(expired?.resolvedWeek).toBe(3);
    expect(active?.resolved).toBe(false);
  });

  it('resolveExpiredIncomingInteractionsForWeek does not resolve boundary week', () => {
    const initial = socialReducer(undefined, { type: 'init' }) as SocialState;
    const seeded = reduce(
      initial,
      pushIncomingInteraction(makeInteraction({ id: 'i-boundary', expiresAtWeek: 3 })),
    );
    const updated = socialReducer(
      seeded,
      resolveExpiredIncomingInteractionsForWeek({ week: 3, resolvedAt: 1000 }),
    ) as SocialState;
    const boundary = updated.incomingInteractions.find((entry) => entry.id === 'i-boundary');
    expect(boundary?.resolved).toBe(false);
  });
});
