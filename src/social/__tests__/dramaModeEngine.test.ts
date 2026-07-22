import { describe, expect, it } from 'vitest';
import {
  advanceDramaNetwork,
  applyDramaActionEffect,
  chooseDramaAIMove,
  createInitialDramaSocialNetwork,
} from '../dramaModeEngine';
import type { DramaSocialNetwork, RelationshipsMap } from '../types';

const players = [
  { id: 'human', name: 'You', status: 'active', isUser: true },
  { id: 'lia', name: 'Lia', status: 'active' },
  { id: 'kai', name: 'Kai', status: 'active' },
  { id: 'nova', name: 'Nova', status: 'active' },
];

const relationships: RelationshipsMap = {
  human: {
    lia: { affinity: 70, tags: [] },
    kai: { affinity: -50, tags: [] },
    nova: { affinity: 10, tags: [] },
  },
  lia: {
    human: { affinity: 68, tags: [] },
    kai: { affinity: 5, tags: [] },
    nova: { affinity: 15, tags: [] },
  },
  kai: {
    human: { affinity: -45, tags: [] },
    lia: { affinity: 5, tags: [] },
    nova: { affinity: 0, tags: [] },
  },
  nova: {
    human: { affinity: 10, tags: [] },
    lia: { affinity: 15, tags: [] },
    kai: { affinity: 0, tags: [] },
  },
};

describe('Drama Mode story network', () => {
  it('stores named false rumours and listener beliefs', () => {
    const network = applyDramaActionEffect(createInitialDramaSocialNetwork(), {
      actionId: 'plant_lie',
      actorId: 'human',
      targetId: 'lia',
      subjectId: 'kai',
      week: 3,
      phase: 'social_1',
      success: true,
    });
    expect(network.rumours[0]).toMatchObject({
      originatorId: 'human',
      subjectId: 'kai',
      truth: 'false',
    });
    expect(network.rumours[0].listeners[0].playerId).toBe('lia');
    expect(
      network.beliefs.some((belief) => belief.holderId === 'lia' && belief.subjectId === 'kai'),
    ).toBe(true);
  });

  it('does not start arcs in week one and starts at most one eligible story in week two', () => {
    const initial = createInitialDramaSocialNetwork();
    const weekOne = advanceDramaNetwork({
      network: initial,
      players,
      relationships,
      week: 1,
      phase: 'social_2',
      seed: 9,
    });
    expect(weekOne.network.arcs).toHaveLength(0);
    const weekTwo = advanceDramaNetwork({
      network: weekOne.network,
      players,
      relationships,
      week: 2,
      phase: 'social_2',
      seed: 9,
    });
    expect(weekTwo.network.arcs).toHaveLength(1);
    const duplicate = advanceDramaNetwork({
      network: weekTwo.network,
      players,
      relationships,
      week: 2,
      phase: 'social_2',
      seed: 9,
    });
    expect(duplicate.network.arcs).toHaveLength(1);
  });

  it('turns established bonds and rivalries into strategic relationship tags', () => {
    const network = createInitialDramaSocialNetwork();
    network.arcs.push({
      id: 'bromance:human~lia:2',
      type: 'bromance',
      participantIds: ['human', 'lia'],
      stage: 'building',
      intensity: 60,
      startedWeek: 2,
      lastAdvancedWeek: 2,
      public: false,
      status: 'active',
    });
    const result = advanceDramaNetwork({
      network,
      players,
      relationships,
      week: 3,
      phase: 'social_1',
      seed: 4,
    });
    expect(result.relationshipEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'human',
          target: 'lia',
          tags: expect.arrayContaining(['alliance', 'bromance']),
        }),
      ]),
    );
  });

  it('paces public exposure and punishes the originator when a lie is disproved', () => {
    const network: DramaSocialNetwork = createInitialDramaSocialNetwork();
    network.rumours.push({
      id: 'lie',
      kind: 'fake_deal',
      originatorId: 'human',
      subjectId: 'kai',
      truth: 'false',
      createdWeek: 2,
      expiresWeek: 6,
      status: 'circulating',
      listeners: [
        { playerId: 'lia', sourceId: 'human', confidence: 0.7, believed: true, heardWeek: 2 },
        { playerId: 'nova', sourceId: 'lia', confidence: 0.65, believed: true, heardWeek: 2 },
        { playerId: 'kai', sourceId: 'nova', confidence: 0.6, believed: true, heardWeek: 3 },
      ],
    });
    const result = advanceDramaNetwork({
      network,
      players,
      relationships,
      week: 3,
      phase: 'nomination_results',
      seed: 2,
    });
    expect(result.publicAnnouncement).toContain('HOUSE EXPOSED');
    expect(result.network.pacing.lastPublicEventWeek).toBe(3);
    expect(
      result.relationshipEffects.some(
        (effect) => effect.target === 'human' && effect.tags?.includes('unreliable'),
      ),
    ).toBe(true);
    const sameWeek = advanceDramaNetwork({
      network: result.network,
      players,
      relationships,
      week: 3,
      phase: 'social_2',
      seed: 2,
    });
    expect(sameWeek.publicAnnouncement).toBeUndefined();
  });

  it('makes AI decisions respond to roles before generic chatter', () => {
    const move = chooseDramaAIMove({
      actorId: 'lia',
      players: players.map((player) =>
        player.id === 'lia' ? { ...player, status: 'nominated' } : player,
      ),
      relationships,
      memory: {},
      network: createInitialDramaSocialNetwork(),
      week: 4,
      phase: 'social_2',
      seed: 3,
      tick: 1,
      posWinnerId: 'nova',
      nomineeIds: ['lia'],
    });
    expect(move).toMatchObject({ actionId: 'ask_use_safety', targetId: 'nova', subjectId: 'lia' });
  });
});
