import { describe, expect, it } from 'vitest';
import type { Player } from '../../../src/types';
import {
  buildFinalGoodbyeMessages,
  generateFinalGoodbyeMessage,
  inferGoodbyePersonality,
} from '../../../src/components/SeasonFinale/finaleGoodbyes';

function makePlayer(id: string, name = id): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'active',
  };
}

describe('finaleGoodbyes', () => {
  it('infers personalities from existing houseguest profiles', () => {
    expect(inferGoodbyePersonality(makePlayer('zed', 'Zed'))).toBe('strategist');
    expect(inferGoodbyePersonality(makePlayer('mimi', 'Mimi'))).toBe('emotional');
  });

  it('keeps quiet personalities brief and strategist personalities reflective', () => {
    const players = [
      makePlayer('finn', 'Finn'),
      makePlayer('zed', 'Zed'),
      makePlayer('kai', 'Kai'),
    ];

    const quietMessage = generateFinalGoodbyeMessage(
      players[0],
      players,
      () => 0.2,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      'quiet',
    );
    const strategistMessage = generateFinalGoodbyeMessage(
      players[1],
      players,
      () => 0.6,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      'strategist',
    );

    expect(quietMessage.segments.length).toBeLessThanOrEqual(2);
    expect(strategistMessage.segmentTypes).toContain('reflection');
  });

  it('avoids duplicate goodbye lines across a full finale sequence', () => {
    const players = [
      makePlayer('finn', 'Finn'),
      makePlayer('mimi', 'Mimi'),
      makePlayer('rae', 'Rae'),
      makePlayer('nova', 'Nova'),
      makePlayer('kai', 'Kai'),
      makePlayer('zed', 'Zed'),
      makePlayer('ivy', 'Ivy'),
      makePlayer('aria', 'Aria'),
      makePlayer('bea', 'Bea'),
      makePlayer('kian', 'Kian'),
    ];

    const messages = buildFinalGoodbyeMessages(players, 3, 42);
    const texts = messages.map((message) => message.text);

    expect(messages).toHaveLength(players.length);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
