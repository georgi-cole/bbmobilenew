import { describe, it, expect } from 'vitest';
import {
  getIncomingInteractionResponseLabel,
  getIncomingInteractionResponseOptions,
  getIncomingInteractionTone,
} from '../incomingInteractionPresentation';
import type { IncomingInteraction, RelationshipsMap, SocialMemoryMap } from '../types';

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'interaction-1',
    fromId: 'p2',
    type: 'warning',
    text: 'Heads up.',
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 2,
    read: false,
    requiresResponse: true,
    resolved: false,
    ...overrides,
  };
}

describe('incomingInteractionPresentation', () => {
  it('maps contextual response labels for warnings', () => {
    const options = getIncomingInteractionResponseOptions('warning');
    expect(options.map((option) => option.label)).toEqual(['Thank', 'Note it', 'Reject', 'Dismiss']);
    expect(options.map((option) => option.responseType)).toEqual([
      'positive',
      'neutral',
      'negative',
      'dismiss',
    ]);
    expect(getIncomingInteractionResponseLabel('warning', 'positive')).toBe('Thank');
  });

  it('derives a warm tone from strong gratitude and trust', () => {
    const interaction = makeInteraction({ type: 'compliment' });
    const relationships: RelationshipsMap = {
      [interaction.fromId]: { user: { affinity: 70, tags: [] } },
    };
    const socialMemory: SocialMemoryMap = {
      [interaction.fromId]: {
        user: {
          gratitude: 8,
          resentment: 0,
          neglect: 0,
          trustMomentum: 4,
          recentEvents: [],
        },
      },
    };

    expect(
      getIncomingInteractionTone({
        interaction,
        relationships,
        socialMemory,
        humanId: 'user',
      }),
    ).toBe('Warm');
  });

  it('flags neglected relationships as feeling ignored', () => {
    const interaction = makeInteraction({ type: 'gossip' });
    const relationships: RelationshipsMap = {
      [interaction.fromId]: { user: { affinity: -15, tags: [] } },
    };
    const socialMemory: SocialMemoryMap = {
      [interaction.fromId]: {
        user: {
          gratitude: 0,
          resentment: 0,
          neglect: 7,
          trustMomentum: -1,
          recentEvents: [],
        },
      },
    };

    expect(
      getIncomingInteractionTone({
        interaction,
        relationships,
        socialMemory,
        humanId: 'user',
      }),
    ).toBe('Feels ignored');
  });
});
