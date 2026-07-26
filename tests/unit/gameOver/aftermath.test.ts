import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialState } from '../../../src/social/types';
import type { Player } from '../../../src/types';
import {
  aftermathIssueStorageKey,
  buildAftermathIssue,
  getBundledAftermathConfig,
  loadAftermathConfig,
  persistAftermathIssue,
  readPersistedAftermathIssue,
  resetAftermathConfigLoaderForTests,
  validateAftermathConfig,
} from '../../../src/screens/GameOver/aftermath';

function makePlayer(
  id: string,
  name: string,
  finalRank: number,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    name,
    avatar: '',
    status: finalRank <= 2 ? 'active' : 'jury',
    finalRank,
    isWinner: finalRank === 1,
    stats: {
      lohWins: finalRank % 3,
      posWins: finalRank % 2,
      timesNominated: Math.max(0, finalRank - 2),
    },
    ...overrides,
  };
}

function makeCast(): Player[] {
  return [
    makePlayer('lia', 'Lia', 1, { stats: { lohWins: 3, posWins: 2, timesNominated: 2 } }),
    makePlayer('pax', 'Pax', 2, { stats: { lohWins: 2, posWins: 1, timesNominated: 3 } }),
    makePlayer('noa', 'Noa', 3),
    makePlayer('kian', 'Kian', 4),
    makePlayer('rey', 'Rey', 5),
    makePlayer('ava', 'Ava', 6),
    makePlayer('milo', 'Milo', 7),
    makePlayer('zoe', 'Zoe', 8),
    makePlayer('ivan', 'Ivan', 9),
    makePlayer('sara', 'Sara', 10),
    makePlayer('alex', 'Alex', 11),
    makePlayer('maya', 'Maya', 12),
  ];
}

function makeSocialState(): SocialState {
  return {
    relationships: {
      lia: {
        pax: { affinity: -80, tags: ['rival'] },
        noa: { affinity: 72, tags: ['ally'] },
      },
      pax: {
        lia: { affinity: -76, tags: ['rival'] },
      },
      noa: {
        lia: { affinity: 70, tags: ['ally'] },
      },
    },
    dramaNetwork: {
      arcs: [
        {
          id: 'rivalry-lia-pax',
          type: 'rivalry',
          participantIds: ['lia', 'pax'],
          intensity: 95,
        },
      ],
      alliances: [
        {
          id: 'alliance-lia-noa',
          participantIds: ['lia', 'noa'],
          status: 'active',
        },
      ],
    },
  } as unknown as SocialState;
}

beforeEach(() => {
  localStorage.clear();
  resetAftermathConfigLoaderForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetAftermathConfigLoaderForTests();
});

describe('After the Eye outcome databank', () => {
  it('ships a valid, varied databank with at least 100 unique individual scenarios', () => {
    const config = getBundledAftermathConfig();
    const validation = validateAftermathConfig(config);
    const ids = config.scenarios.map((scenario) => scenario.id);

    expect(validation.valid).toBe(true);
    expect(config.scenarios.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(config.categories).length).toBeGreaterThanOrEqual(15);
    expect(config.linkedScenarios.length).toBeGreaterThanOrEqual(4);
  });

  it('generates deterministic, non-repetitive stories without leaking placeholders', () => {
    const players = makeCast();
    const options = {
      gameId: 'game-after-eye-test',
      week: 9,
      favoriteWinnerId: 'noa',
      social: makeSocialState(),
    };
    const first = buildAftermathIssue(players, 4, options);
    const second = buildAftermathIssue(players, 4, options);
    const individualStories = first.stories.filter((story) => !story.linkedEventId);
    const allCopy = first.stories
      .flatMap((story) => [
        story.headline,
        story.subheadline,
        story.body,
        story.twist,
        ...story.bulletPoints,
      ])
      .join(' ');

    expect(second.stories).toEqual(first.stories);
    expect(first.stories).toHaveLength(players.length);
    expect(new Set(individualStories.map((story) => story.scenarioId)).size)
      .toBe(individualStories.length);
    expect(allCopy).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/);
    expect(allCopy).not.toMatch(/\b(undefined|null)\b/i);
  });

  it('turns a real rivalry into a coherent paired tabloid event', () => {
    const issue = buildAftermathIssue(makeCast(), 4, {
      gameId: 'rivalry-linked-story',
      week: 9,
      social: makeSocialState(),
    });
    const liaStory = issue.stories.find((story) => story.playerId === 'lia');
    const paxStory = issue.stories.find((story) => story.playerId === 'pax');

    expect(liaStory?.linkedEventId).toBeTruthy();
    expect(paxStory?.linkedEventId).toBe(liaStory?.linkedEventId);
    expect(`${liaStory?.headline} ${liaStory?.body}`).toContain('Pax');
    expect(`${paxStory?.headline} ${paxStory?.body}`).toContain('Lia');
  });

  it('persists a published issue so later config changes do not rewrite it', () => {
    const key = aftermathIssueStorageKey('profile-1', 'game-1', 2);
    const issue = buildAftermathIssue(makeCast(), 2, { gameId: 'game-1' });
    const originalHeadline = issue.stories[0]?.headline;

    persistAftermathIssue(key, issue);
    const stored = readPersistedAftermathIssue(key);
    const changedConfig = structuredClone(getBundledAftermathConfig());
    changedConfig.scenarios[0]!.headlines = ['THIS SHOULD ONLY AFFECT A NEW ISSUE'];
    buildAftermathIssue(makeCast(), 2, { gameId: 'game-1' }, changedConfig);

    expect(stored?.stories[0]?.headline).toBe(originalHeadline);
    expect(readPersistedAftermathIssue(key)).toEqual(issue);
  });

  it('rejects malformed remote content and falls back to the bundled databank', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: 999, scenarios: [] }),
    }));

    const loaded = await loadAftermathConfig();

    expect(loaded).toBe(getBundledAftermathConfig());
  });

  it('uses the last known valid remote config when the server is temporarily unavailable', async () => {
    const remote = structuredClone(getBundledAftermathConfig());
    remote.editorial.slogan = 'A remotely edited late-edition slogan';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => remote,
    }));

    expect((await loadAftermathConfig()).editorial.slogan).toBe(remote.editorial.slogan);

    resetAftermathConfigLoaderForTests();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect((await loadAftermathConfig()).editorial.slogan).toBe(remote.editorial.slogan);
  });

  it('reports unsupported placeholders before a bad config can reach the UI', () => {
    const invalid = structuredClone(getBundledAftermathConfig());
    invalid.scenarios[0]!.headlines = ['{name} Meets {unsupportedPerson}'];

    const validation = validateAftermathConfig(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/unsupported placeholder/i);
  });
});
