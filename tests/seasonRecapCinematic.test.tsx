import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SeasonRecapCinematic from '../src/components/SeasonRecapCinematic/SeasonRecapCinematic';
import { SAMPLE_FINALE_NEWSPAPER_PAGES, generatePlayfulHeadline } from '../src/components/SeasonRecapCinematic/newspaperFrontPages';
import type { Player } from '../src/types';
import type { PublicOpinionState } from '../src/publicOpinion/types';

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

// ─── Scene duration constants (must stay in sync with the component) ──────────
const INTRO_1_MS = 2800;
const INTRO_2_MS = 3200;
const INTRO_3_MS = 3400;
const MONTAGE_MS = 5200;
const CATEGORY_MS = 4800;
const LADDER_MS = 9000;
const FINALE_MS = 5500;
const EXIT_FADE_MS = 420;

/**
 * Helper: advance through every scene up to (but not including) the finale.
 *
 * With this player set and no public opinion the category list is:
 *   cat_0 = Compzilla (Avery, 3 wins)
 *   cat_1 = Mess Factory (Casey, 3 noms)
 *   cat_2 = Ghost Mode (Blake, 2 noms — next fewest after Avery who is already used)
 *
 * Each `act` call must cover exactly one scene so React can process the state
 * update and register the next timeout before the subsequent advance begins.
 */
async function advanceToFinale() {
  await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); }); // → intro_2
  await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); }); // → intro_3
  await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); }); // → montage
  await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); }); // → cat_0
  await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // → cat_1
  await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // → cat_2
  await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // → ladder
  await act(async () => { await vi.advanceTimersByTimeAsync(LADDER_MS); });   // → finale
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

  it('renders the dramatic intro card first', () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} onComplete={onComplete} />,
    );

    expect(screen.getByText('The votes are in.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips cleanly and finishes the recap', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} onComplete={onComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip recap' }));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps the recap on screen beyond the old shorter timing', async () => {
    const onComplete = vi.fn();
    // Old total was about 18 820 ms — the new recap is substantially longer.
    const OLD_TOTAL_MS = 2200 + 3000 + 3400 + 3400 + 4200 + 2200 + 420;
    const elapsedToFirstCategory = INTRO_1_MS + INTRO_2_MS + INTRO_3_MS + MONTAGE_MS;
    const deltaPastOldTotalMs = 50;

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} onComplete={onComplete} />,
    );

    // Advance through all 3 intro scenes (9 400 ms) and the montage (5 200 ms)
    // to land on the first category scene at 14 600 ms.
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); });

    // Advance just beyond the old recap's total runtime without leaving cat_0.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OLD_TOTAL_MS - elapsedToFirstCategory + deltaPastOldTotalMs);
    });

    expect(elapsedToFirstCategory).toBeLessThan(OLD_TOTAL_MS);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('Compzilla')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip recap' })).toBeTruthy();
  });

  it('completes only after the full finale duration has elapsed', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} onComplete={onComplete} />,
    );

    await advanceToFinale();

    // Finale scene is now active.
    expect(screen.getByText('the final verdict.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    // Advance to just before the finale timer expires — should still be running.
    await act(async () => { await vi.advanceTimersByTimeAsync(FINALE_MS - 100); });
    expect(onComplete).not.toHaveBeenCalled();

    // Cross the FINALE_MS threshold (+ 1 ms) so the scene timer fires and the
    // chained setTimeout(finish, 0) is scheduled in the same act flush.
    await act(async () => { await vi.advanceTimersByTimeAsync(200); }); // crosses 5500ms
    // Then flush the exit-fade timer (420 ms) in its own act so React can process
    // the setVisible(false) update before onComplete is expected.
    await act(async () => { await vi.advanceTimersByTimeAsync(EXIT_FADE_MS + 50); });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows Compzilla and Mess Factory category cards', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} onComplete={onComplete} />,
    );

    // Advance past intro + montage into cat_0 (Compzilla).
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); });

    // cat_0 = Compzilla (Avery has 3 total wins)
    expect(screen.getByText('Compzilla')).toBeTruthy();
    expect(screen.getByText(/Built different on game day/i)).toBeTruthy();

    // Advance into cat_1 (Mess Factory — Casey with 3 nominations)
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });
    expect(screen.getByText('Mess Factory')).toBeTruthy();

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('shows public-opinion-driven categories when public data is available', async () => {
    const onComplete = vi.fn();

    // With public opinion there are 5 categories:
    //   cat_0 Compzilla (Avery), cat_1 Mess Factory (Casey), cat_2 Ghost Mode (Blake),
    //   cat_3 Vibe Curator (Avery – most liked, 82%),
    //   cat_4 Heat Magnet (Drew – most disliked, 21%)
    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={PUBLIC_OPINION} onComplete={onComplete} />,
    );

    // Advance through intro + montage + cat_0 + cat_1 to land on cat_2 first,
    // then cat_2 → cat_3 (Vibe Curator).
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // cat_0 → cat_1
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // cat_1 → cat_2
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); }); // cat_2 → cat_3

    expect(screen.getByText('Vibe Curator')).toBeTruthy();
    expect(screen.getByText(/82% approval/i)).toBeTruthy();

    // Advance into cat_4 (Heat Magnet — Drew 21%)
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });
    expect(screen.getByText('Heat Magnet')).toBeTruthy();
    expect(screen.getByText(/21% approval/i)).toBeTruthy();

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('still shows Heat Magnet when the lowest-approval player already won another category', async () => {
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

    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(CATEGORY_MS); });

    expect(screen.getByText('Heat Magnet')).toBeTruthy();
    expect(screen.getByText('Casey')).toBeTruthy();
    expect(screen.getByText(/21% approval/i)).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('falls back to gameplay-stats categories when public data is unavailable', async () => {
    const onComplete = vi.fn();

    render(
      <SeasonRecapCinematic season={9} week={12} players={PLAYERS} publicOpinion={undefined} onComplete={onComplete} />,
    );

    // Advance past intro + montage into the first category.
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_1_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_2_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(INTRO_3_MS); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MONTAGE_MS); });

    // Should see a gameplay category (Compzilla), not a public-opinion one.
    expect(screen.getByText('Compzilla')).toBeTruthy();
    expect(screen.queryByText('Vibe Curator')).toBeNull();
    expect(screen.queryByText('Heat Magnet')).toBeNull();

    expect(onComplete).not.toHaveBeenCalled();
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
