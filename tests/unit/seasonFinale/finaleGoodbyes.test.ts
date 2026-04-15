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
  it('infers personalities from controlled competition profiles', () => {
    expect(inferGoodbyePersonality({
      ...makePlayer('planner'),
      competitionProfile: {
        physical: 40,
        mental: 85,
        precision: 60,
        nerve: 55,
        consistency: 82,
        clutch: 50,
        chokeRisk: 20,
        luck: 30,
      },
    })).toBe('strategist');
    expect(inferGoodbyePersonality({
      ...makePlayer('wildcard'),
      competitionProfile: {
        physical: 55,
        mental: 45,
        precision: 50,
        nerve: 60,
        consistency: 40,
        clutch: 55,
        chokeRisk: 25,
        luck: 80,
      },
    })).toBe('chaotic');
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

  it('does not choose shoutouts when the current player has no one else to address', () => {
    const solo = makePlayer('solo', 'Solo');

    const message = generateFinalGoodbyeMessage(
      solo,
      [solo],
      () => 0.9,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      'loyal',
    );

    expect(message.segmentTypes).not.toContain('shoutout');
    expect(message.text.length).toBeGreaterThan(0);
  });

  it('does not leak rejected attempt phrases into the shared dedupe state', () => {
    const player = makePlayer('planner', 'Planner');
    const peers = [player, makePlayer('ally', 'Ally')];
    const duplicate = generateFinalGoodbyeMessage(
      player,
      peers,
      () => 0,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      'strategist',
    );

    const usedPhrases = new Set<string>();
    const usedLines = new Set<string>([duplicate.text]);
    const usedShoutouts = new Set<string>();

    const fallback = generateFinalGoodbyeMessage(
      player,
      peers,
      () => 0,
      usedPhrases,
      usedLines,
      usedShoutouts,
      'strategist',
    );

    expect(fallback.text).not.toBe(duplicate.text);
    expect(usedPhrases.has(duplicate.text)).toBe(false);
    expect(usedPhrases.size).toBe(1);
    expect(usedShoutouts.size).toBe(0);
  });

  it('keeps fallback lines unique even after the fallback pool is exhausted', () => {
    const usedPhrases = new Set<string>();
    const usedLines = new Set<string>();
    const usedShoutouts = new Set<string>();

    const fallbackTexts = Array.from({ length: 6 }, (_, index) => {
      const player = makePlayer(`fallback-${index}`, `Fallback ${index}`);
      const duplicate = generateFinalGoodbyeMessage(
        player,
        [player, makePlayer(`ally-${index}`, `Ally ${index}`)],
        () => 0,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
        'strategist',
      );

      usedLines.add(duplicate.text);
      const message = generateFinalGoodbyeMessage(
        player,
        [player, makePlayer(`ally-${index}`, `Ally ${index}`)],
        () => 0,
        usedPhrases,
        usedLines,
        usedShoutouts,
        'strategist',
      );
      return message.text;
    });

    expect(new Set(fallbackTexts).size).toBe(fallbackTexts.length);
  });
});
