import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinalFaceoff from '../src/components/FinalFaceoff/FinalFaceoff';
import {
  FIRST_CLUE_DELAY_MS,
  PUBLIC_VOTE_RECAP_HOLD_MS,
  VOTE_REVEAL_INITIAL_DELAY_MS,
  VOTE_REVEAL_STAGGER_MS,
} from '../src/components/FinalFaceoff/finaleTiming';
import {
  PHRASE_TYPING_CHAR_INTERVAL_MS,
  PHRASE_TYPING_START_DELAY_MS,
} from '../src/components/TribunalMemberStage/tribunalMemberStageTiming';
import gameReducer from '../src/store/gameSlice';
import finaleReducer from '../src/store/finaleSlice';
import settingsReducer from '../src/store/settingsSlice';
import uiReducer from '../src/store/uiSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import { SoundManager } from '../src/services/sound/SoundManager';
import type { PlayerPublicProfile } from '../src/publicOpinion/types';

const MIN_TYPED_CHARS_VISIBLE = 1;
const MAX_CLUE_READING_HOLD_MS = 9000;

const mockPlay = vi.fn();
const mockRequestBgm = vi.fn();
const mockReleaseBgm = vi.fn();

vi.mock('../src/hooks/useSound', () => ({
  default: () => ({
    play: mockPlay,
    requestBgm: mockRequestBgm,
    releaseBgm: mockReleaseBgm,
  }),
}));

vi.mock('../src/components/SeasonRecapCinematic/SeasonRecapCinematic', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="season-recap">
      <span>Season recap</span>
      <button type="button" onClick={onComplete}>
        Finish recap
      </button>
    </div>
  ),
}));

function makeProfile(
  playerId: string,
  approval: number,
  overrides: Partial<PlayerPublicProfile> = {},
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
    ...overrides,
  };
}

function makeStore() {
  const baseGame = gameReducer(undefined, { type: '@@INIT' });
  const baseFinale = finaleReducer(undefined, { type: '@@INIT' });
  const baseSettings = settingsReducer(undefined, { type: '@@INIT' });
  const basePublicOpinion = publicOpinionReducer(undefined, { type: '@@INIT' });

  return configureStore({
    reducer: {
      game: gameReducer,
      finale: finaleReducer,
      settings: settingsReducer,
      ui: uiReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: {
        ...baseGame,
        season: 3,
        week: 12,
        phase: 'jury',
        seed: 42,
        players: [
          { id: 'f1', name: 'Avery', avatar: '😀', status: 'active' as const },
          { id: 'f2', name: 'Blake', avatar: '😎', status: 'active' as const },
          { id: 'j1', name: 'Casey', avatar: '🧠', status: 'jury' as const },
        ],
      },
      finale: baseFinale,
      settings: baseSettings,
      ui: uiReducer(undefined, { type: '@@INIT' }),
      publicOpinion: {
        ...basePublicOpinion,
        profiles: {
          f1: makeProfile('f1', 62),
          f2: makeProfile('f2', 78),
        },
      },
    },
  });
}

async function advanceToRecapBoundary() {
  // The finale flow crosses two exact timeout boundaries:
  // 1) the establishing delay, then the bounded reading hold for the juror clue
  // 2) PUBLIC_VOTE_RECAP_HOLD_MS of extra hold time after the public vote appears
  // Splitting each phase into (n - 1) ms + 1 ms keeps the assertions pinned to the edge so we can
  // prove the recap does not render early.
  await act(async () => {
    vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS - 1);
  });

  await act(async () => {
    vi.advanceTimersByTime(1);
  });

  await act(async () => {
    vi.advanceTimersByTime(MAX_CLUE_READING_HOLD_MS);
  });

  await act(async () => {
    vi.advanceTimersByTime(PUBLIC_VOTE_RECAP_HOLD_MS - 1);
  });
}

async function advanceToRecap() {
  await advanceToRecapBoundary();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
}

function getTypedPhraseText(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\|/g, '').trim();
}

describe('FinalFaceoff public vote pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses a non-public full-body fallback when a juror lacks a formal cutout', async () => {
    const store = makeStore();

    const { container } = render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS);
    });

    expect(screen.getByText('Casey')).toBeTruthy();
    expect(screen.getByAltText('Casey').getAttribute('src')).toBe('assets/full_body_fallback_neutral.png');
    expect(container.querySelector('.tms-public-placeholder')).toBeNull();
  });

  it('keeps the public vote message on screen for 3 seconds before switching to the recap', async () => {
    const store = makeStore();
    // One typed character is enough to prove the public line is visibly rendering
    // before the recap hold window expires.
    const phraseLeadInMs =
      PHRASE_TYPING_START_DELAY_MS + (MIN_TYPED_CHARS_VISIBLE * PHRASE_TYPING_CHAR_INTERVAL_MS);
    const remainingHoldMs = Math.max(0, (PUBLIC_VOTE_RECAP_HOLD_MS - 1) - phraseLeadInMs);

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(FIRST_CLUE_DELAY_MS - 1);
    });

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(MAX_CLUE_READING_HOLD_MS);
    });

    await act(async () => {
      vi.advanceTimersByTime(phraseLeadInMs);
    });

    expect(
      screen.getByText((_, element) => {
        if (!element?.matches('.tms-phrase')) return false;
        return getTypedPhraseText(element).length >= MIN_TYPED_CHARS_VISIBLE;
      }),
    ).toBeTruthy();
    expect(screen.queryByTestId('season-recap')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(remainingHoldMs);
    });

    expect(screen.queryByTestId('season-recap')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId('season-recap')).toBeTruthy();
    expect(store.getState().ui.musicScene).toBe('season_recap');
  });

  it('fades out the tribunal music before the season recap starts', async () => {
    const fadeOutMusicSpy = vi
      .spyOn(SoundManager, 'fadeOutMusic')
      .mockResolvedValue(undefined);
    const store = makeStore();

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await advanceToRecapBoundary();

    expect(fadeOutMusicSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(fadeOutMusicSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('season-recap')).toBeTruthy();
    // With the mock returning a resolved Promise, the .then() dispatch fires as
    // a microtask which act() flushes — musicScene must already be 'season_recap'.
    expect(store.getState().ui.musicScene).toBe('season_recap');
  });

  it('reveals post-recap tribunal votes one-by-one before declaring the winner', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await advanceToRecap();

    expect(screen.getByTestId('season-recap')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Finish recap' }).click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(store.getState().ui.musicScene).toBe('jury_voting');
    expect(screen.getByText('0 / 2 votes revealed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue 🎉' })).toBeNull();
    expect(screen.getAllByLabelText('Vote not yet revealed')).toHaveLength(2);
    expect(screen.getAllByText('0', { selector: '.fo-finalist__votes' })).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(VOTE_REVEAL_INITIAL_DELAY_MS - 1);
    });

    expect(screen.getByText('0 / 2 votes revealed')).toBeTruthy();
    expect(screen.getAllByLabelText('Vote not yet revealed')).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText('1 / 2 votes revealed')).toBeTruthy();
    expect(screen.getAllByLabelText('Vote not yet revealed')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Continue 🎉' })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(VOTE_REVEAL_STAGGER_MS);
    });

    expect(screen.queryByLabelText('Vote not yet revealed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue 🎉' })).toBeTruthy();
    expect(screen.getByText(/wins The Big Eye!/)).toBeTruthy();
  });
});
