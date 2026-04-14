import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinalFaceoff from '../src/components/FinalFaceoff/FinalFaceoff';
import gameReducer from '../src/store/gameSlice';
import finaleReducer from '../src/store/finaleSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import { pickPhrase, PUBLIC_JURY_VOTE_LINES } from '../src/utils/juryUtils';
import type { PlayerPublicProfile } from '../src/publicOpinion/types';

vi.mock('../src/hooks/useSound', () => ({
  default: () => ({
    play: vi.fn(),
    requestBgm: vi.fn(),
    releaseBgm: vi.fn(),
  }),
}));

vi.mock('../src/components/SeasonRecapCinematic/SeasonRecapCinematic', () => ({
  default: () => <div data-testid="season-recap">Season recap</div>,
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

describe('FinalFaceoff public vote pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
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
      vi.advanceTimersByTime(3000);
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
  });
});
