import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic';
import { buildSeasonRecapData } from '../src/components/SeasonRecapCinematic/seasonRecapData';
import {
  buildSeasonRecapTimeline,
  CATEGORY_SCENE_DURATION_MS,
  INTRO_MIN_DURATION_MS,
  RECAP_EXIT_FADE_MS,
  TOTAL_RECAP_DURATION_MS,
} from '../src/components/SeasonRecapCinematic/seasonRecapTimeline';
import { SAMPLE_FINALE_NEWSPAPER_PAGES, generatePlayfulHeadline } from '../src/components/SeasonRecapCinematic/newspaperFrontPages';
import type { Player } from '../src/types';
import type { PublicOpinionState } from '../src/publicOpinion/types';

const BASE_URL = import.meta.env.BASE_URL;

vi.mock('framer-motion', async () => {
  const React = await import('react');

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  );

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion,
    useReducedMotion: () => false,
  };
});

const PLAYERS: Player[] = [
  {
    id: 'f1',
    name: 'Avery',
    status: 'active',
    avatar: '😀',
    stats: { lohWins: 2, posWins: 1, timesNominated: 1 },
  },
  {
    id: 'f2',
    name: 'Blake',
    status: 'active',
    avatar: '😎',
    stats: { lohWins: 1, posWins: 2, timesNominated: 2 },
  },
  {
    id: 'j1',
    name: 'Casey',
    status: 'jury',
    avatar: '🧠',
    seasonPlacement: 3,
    stats: { lohWins: 1, posWins: 0, timesNominated: 3 },
  },
  {
    id: 'e1',
    name: 'Drew',
    status: 'evicted',
    avatar: '🔥',
    seasonPlacement: 4,
    stats: { lohWins: 0, posWins: 1, timesNominated: 2 },
  },
];

const PUBLIC_OPINION: PublicOpinionState = {
  profiles: {
    f1: {
      playerId: 'f1', approval: 82, previousApproval: 74, seasonApprovals: [50, 61, 74, 82], completedDirectionCount: 1, cumulativePositiveDelta: 32,
    },
    f2: {
      playerId: 'f2', approval: 47, previousApproval: 55, seasonApprovals: [50, 59, 55, 47], completedDirectionCount: 0, cumulativePositiveDelta: 9,
    },
    j1: {
      playerId: 'j1', approval: 63, previousApproval: 58, seasonApprovals: [50, 55, 58, 63], completedDirectionCount: 0, cumulativePositiveDelta: 13,
    },
    e1: {
      playerId: 'e1', approval: 21, previousApproval: 39, seasonApprovals: [50, 45, 39, 21], completedDirectionCount: 0, cumulativePositiveDelta: 0,
    },
  },
  directions: [],
  feed: [
    {
      id: 'headline-1', playerId: 'e1', text: 'Drew shocked the audience with a feud that swallowed the whole week.', delta: -21, week: 10, timestamp: 1001, isHeadline: true,
    },
    {
      id: 'headline-2', playerId: 'f1', text: 'Avery sent the ratings soaring with a power play nobody stopped talking about.', delta: 14, week: 11, timestamp: 1002, isHeadline: true,
    },
  ],
  lastUpdatedWeek: 11,
  feedPostsThisDay: 2,
  currentFeedDay: 11,
};

function getTimeline(publicOpinion: PublicOpinionState | undefined = PUBLIC_OPINION) {
  const recapData = buildSeasonRecapData(PLAYERS, 12, publicOpinion);
  return buildSeasonRecapTimeline(
    recapData.categories.map((category) => category.id),
    recapData.evictionWaves.length,
  );
}

async function advanceToScene(targetSceneId: string, publicOpinion: PublicOpinionState | undefined = PUBLIC_OPINION) {
  const timeline = getTimeline(publicOpinion);
  const targetIndex = timeline.findIndex((scene) => scene.id === targetSceneId);

  for (let index = 0; index < targetIndex; index += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(timeline[index].durationMs);
    });
  }

  return timeline;
}

describe('SeasonRecapCinematic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (!window.matchMedia) {
      const matchMediaMock = vi.fn<(query: string) => MediaQueryList>().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      window.matchMedia = matchMediaMock;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the first suspense card', () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    expect(screen.getByText('THE VOTES ARE IN.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('builds a recap timeline from the configured scene durations', () => {
    const timeline = getTimeline();
    const categoryIds = buildSeasonRecapData(PLAYERS, 12).categories.map((category) => category.id);

    expect(TOTAL_RECAP_DURATION_MS).toBeGreaterThan(0);
    expect(timeline.at(-1)?.endMs).toBeGreaterThan(0);
    expect(TOTAL_RECAP_DURATION_MS).toBeGreaterThanOrEqual(timeline.at(-1)?.endMs ?? 0);
    expect(categoryIds).toEqual([
      'compzilla',
      'head_honcho',
      'mess_factory',
      'ghost_mode',
      'vibe_curator',
      'heat_magnet',
    ]);
  });

  it('keeps intro and category award scenes above the minimum durations', () => {
    const timeline = getTimeline();
    const introScenes = timeline.filter((scene) => scene.kind === 'intro');
    const categoryScenes = timeline.filter((scene) => scene.kind === 'category');

    expect(introScenes).toHaveLength(2);
    expect(introScenes.every((scene) => scene.durationMs >= INTRO_MIN_DURATION_MS)).toBe(true);
    expect(categoryScenes).toHaveLength(6);
    expect(categoryScenes.every((scene) => scene.durationMs >= CATEGORY_SCENE_DURATION_MS)).toBe(true);
  });

  it('drops the extra montage text scenes before the media reveal', () => {
    const timeline = getTimeline();

    expect(timeline.filter((scene) => scene.id.startsWith('montage_'))).toHaveLength(0);
    expect(timeline[0]?.id).toBe('intro_votes_in');
    expect(timeline[1]?.id).toBe('intro_before_final_word');
    expect(timeline[2]?.id).toBe('headline_girls');
  });

  it('includes two lightweight media screens before categories', () => {
    const timeline = getTimeline();
    const headlineScene = timeline.find((scene) => scene.kind === 'headline_girls');
    const phoneScene = timeline.find((scene) => scene.kind === 'phone_post_boys');
    const firstCategory = timeline.find((scene) => scene.kind === 'category');

    expect(headlineScene).toBeTruthy();
    expect(phoneScene).toBeTruthy();
    expect(headlineScene!.endMs).toBeLessThanOrEqual(firstCategory!.startMs);
    expect(phoneScene!.endMs).toBeLessThanOrEqual(firstCategory!.startMs);
  });

  it('runs the eviction ladder after categories and before the moment-of-truth scene', () => {
    const timeline = getTimeline();
    const categoryScenes = timeline.filter((scene) => scene.kind === 'category');
    const lastCategory = categoryScenes.at(-1);
    const ladderIntro = timeline.find((scene) => scene.kind === 'ladder_intro');
    const ladderWaves = timeline.filter((scene) => scene.kind === 'ladder_wave');
    const lastScene = timeline.at(-1);

    expect(ladderIntro).toBeTruthy();
    expect(ladderWaves.length).toBeGreaterThan(0);
    expect(ladderIntro!.startMs).toBeGreaterThanOrEqual(lastCategory!.endMs);
    expect(ladderWaves[0]!.startMs).toBeGreaterThanOrEqual(ladderIntro!.endMs);
    expect(lastScene?.kind).toBe('moment_of_truth');
    expect(lastScene?.startMs).toBeGreaterThanOrEqual(ladderWaves.at(-1)!.endMs);
  });

  it('does not contain any tabloid or handoff scenes', () => {
    const timeline = getTimeline();
    const removed = timeline.filter(
      (scene) =>
        scene.kind === ('tabloid' as string) ||
        scene.kind === ('handoff' as string),
    );
    expect(removed).toHaveLength(0);
  });

  it('renders the headline-girls screen with the expected image', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    await advanceToScene('headline_girls');

    const img = document.querySelector('.src-headline-media__image') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe(`${BASE_URL}assets/skins/thegirls.webp`);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders the phone-post-boys screen with the expected image', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    await advanceToScene('phone_post_boys');

    const img = document.querySelector('.src-phone-post__image') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe(`${BASE_URL}assets/skins/the boys.webp`);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders the moment-of-truth screen with finalist cutouts', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    await advanceToScene('moment_of_truth');

    expect(screen.getByText('AND NOW THE MOMENT OF TRUTH')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders the redesigned eviction ladder with a spotlight and ranking rail before the final moment', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    await advanceToScene('ladder_wave_0');

    expect(document.querySelector('.eviction-ladder')).toBeTruthy();
    expect(document.querySelector('.eviction-ladder__spotlight')).toBeTruthy();
    expect(document.querySelector('.eviction-ladder__rankings')).toBeTruthy();
    expect(screen.getByText('Eviction Ladder')).toBeTruthy();
    expect(screen.getByText('In order of eviction')).toBeTruthy();
    expect(screen.getAllByText('4TH')).toHaveLength(2);
    expect(screen.getByText('3RD')).toBeTruthy();
    expect(screen.getByText('FINALIST')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('uses actual ellipsis characters instead of literal unicode escape text', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    await advanceToScene('intro_before_final_word');

    expect(screen.getByText('BUT BEFORE')).toBeTruthy();
    expect(screen.getByText('THE FINAL WORD…')).toBeTruthy();
    expect(screen.queryByText(/\\u2026/i)).toBeNull();
  });

  it('shows Heat Magnet even when the same player already won another category', async () => {
    const onComplete = vi.fn();
    const duplicateWinnerPublicOpinion: PublicOpinionState = {
      ...PUBLIC_OPINION,
      profiles: {
        ...PUBLIC_OPINION.profiles,
        j1: {
          ...PUBLIC_OPINION.profiles.j1,
          approval: 21,
          previousApproval: 32,
          seasonApprovals: [50, 44, 32, 21],
        },
        e1: {
          ...PUBLIC_OPINION.profiles.e1,
          approval: 34,
          previousApproval: 41,
          seasonApprovals: [50, 46, 41, 34],
        },
      },
    };

    render(
      <SeasonRecapCinematic
        season={9}
        week={12}
        players={PLAYERS}
        publicOpinion={duplicateWinnerPublicOpinion}
        onComplete={onComplete}
      />,
    );

    await advanceToScene('category_heat_magnet', duplicateWinnerPublicOpinion);

    expect(screen.getByText('HEAT MAGNET')).toBeTruthy();
    expect(screen.getByText('Casey')).toBeTruthy();
    expect(screen.getByText(/21% approval/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not finish until the entire recap and handoff have completed', async () => {
    const onComplete = vi.fn();
    const timeline = getTimeline();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    for (let index = 0; index < timeline.length - 1; index += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(timeline[index].durationMs);
      });
    }

    expect(screen.getByRole('dialog', { name: 'Season recap cinematic' })).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(timeline.at(-1)!.durationMs - 50);
    });
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(onComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECAP_EXIT_FADE_MS + 25);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('exposes reusable playful headline generation data for the finale newspaper', () => {
    expect(SAMPLE_FINALE_NEWSPAPER_PAGES.length).toBeGreaterThan(0);
    const headlineDraft = generatePlayfulHeadline({
      id: 'evt-1',
      week: 8,
      type: 'chaos',
      subjectName: 'Avery',
      detail: 'Avery turned the house upside down overnight.',
    });
    expect(headlineDraft.headline).toBeTruthy();
    expect(headlineDraft.subheadline).toBeTruthy();
    expect(headlineDraft.category).toBeTruthy();
    expect(headlineDraft.stamp).toBeTruthy();
  });
});
