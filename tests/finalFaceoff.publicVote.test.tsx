import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinalFaceoff from '../src/components/FinalFaceoff/FinalFaceoff';
import gameReducer from '../src/store/gameSlice';
import finaleReducer from '../src/store/finaleSlice';
import settingsReducer from '../src/store/settingsSlice';
import uiReducer from '../src/store/uiSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import { SoundManager } from '../src/services/sound/SoundManager';
import { pickPhrase, PUBLIC_JURY_VOTE_LINES } from '../src/utils/juryUtils';
import type { PlayerPublicProfile } from '../src/publicOpinion/types';

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
  // 1) 3000 ms for each juror clue reveal
  // 2) 3000 ms of extra hold time after the public vote bubble appears
  // Splitting 2999 ms + 1 ms keeps the assertions pinned to the edge so we can
  // prove the recap does not render early.
  await act(async () => {
    vi.advanceTimersByTime(2999);
  });

  await act(async () => {
    vi.advanceTimersByTime(1);
  });

  await act(async () => {
    vi.advanceTimersByTime(3000);
  });

  await act(async () => {
    vi.advanceTimersByTime(2999);
  });
}

async function advanceToRecap() {
  await advanceToRecapBoundary();

  await act(async () => {
    vi.advanceTimersByTime(1);
  });
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

  it('keeps the public vote message on screen for 3 seconds before switching to the recap', async () => {
    const store = makeStore();
    const expectedPublicPhrase = pickPhrase(PUBLIC_JURY_VOTE_LINES, 42, 1);

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(
      screen.getByText(expectedPublicPhrase, { exact: false, selector: '.jb-phrase' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('season-recap')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });

    expect(screen.queryByTestId('season-recap')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByTestId('season-recap')).toBeTruthy();
    expect(store.getState().ui.musicScene).toBe('season_recap');
  });

  it('stops the tribunal music before the season recap starts', async () => {
    const stopAllMusicSpy = vi.spyOn(SoundManager, 'stopAllMusic').mockImplementation(() => {});
    const store = makeStore();

    render(
      <Provider store={store}>
        <FinalFaceoff />
      </Provider>,
    );

    await advanceToRecapBoundary();

    expect(stopAllMusicSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(stopAllMusicSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('season-recap')).toBeTruthy();
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
      vi.advanceTimersByTime(799);
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
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByLabelText('Vote not yet revealed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue 🎉' })).toBeTruthy();
    expect(screen.getByText(/wins The Big Eye!/)).toBeTruthy();
  });
});
