import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomeHub from '../HomeHub';
import { preloadImage } from '../../../utils/preload';
import type { RemoteConfig } from '../../../remoteConfig/remoteConfigTypes';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockState: {
  game: {
    gameId: string;
    season?: number;
    week?: number;
    phase?: string;
    players: Array<{ id: string; isUser: boolean }>;
    seasonArchives: Array<{ seasonId: string }>;
  };
  profiles: { activeProfileId: null; isGuest: boolean; profiles: never[] };
  remoteConfig: { config: RemoteConfig | null };
} = {
  game: {
    gameId: 'game-A',
    players: [],
    seasonArchives: [],
  },
  profiles: {
    activeProfileId: null,
    isGuest: true,
    profiles: [],
  },
  remoteConfig: {
    config: null,
  },
};

const preloadImageMock = vi.mocked(preloadImage);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector(mockState),
}));

vi.mock('../../../hooks/useBackgroundTheme', () => ({
  default: () => ({ url: '/assets/background.jpg' }),
}));

vi.mock('../../../hooks/useLoadIntroHub', async () => {
  const { useEffect } = await import('react');

  return {
    default: function useLoadIntroHubMock() {
      useEffect(() => {
        const container = document.getElementById('intro-hub');
        if (!container || container.querySelector('.hub-chip')) {
          return () => {};
        }

        const chip = document.createElement('div');
        chip.className = 'hub-chip';
        container.appendChild(chip);

        return () => {
          chip.remove();
        };
      }, []);
    },
  };
});

vi.mock('../../../utils/preload', () => ({
  preloadImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../components/KolequantSplash/KolequantSplash', () => ({
  default: ({
    onFinish,
    progress,
    status,
  }: {
    onFinish?: () => void;
    progress?: number;
    ready?: boolean;
    status?: string;
  }) => (
    <button data-testid="kolequant-splash" onClick={onFinish} type="button">
      {status ?? 'Finish splash'} {progress ?? 0}%
    </button>
  ),
}));

vi.mock('../../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}));

vi.mock('../../../components/PermissionPrompts/PermissionPrompts', () => ({
  default: () => <div data-testid="permission-prompts" />,
}));

vi.mock('../../../components/AssetPreloaderOverlay/AssetPreloaderOverlay', () => ({
  default: () => <div data-testid="asset-preloader-overlay" />,
}));

vi.mock('../../../components/GameButton/GameButton', () => ({
  default: ({
    label,
    onClick,
  }: {
    label: string;
    onClick: () => void;
  }) => (
    <button onClick={onClick} type="button">
      {label}
    </button>
  ),
}));

function renderHomeHub(initialEntry: string | { pathname: string; state?: unknown } = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <HomeHub />
    </MemoryRouter>,
  );
}

describe('HomeHub', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    delete (window as Window & { game?: Record<string, unknown> }).game;
    mockState.game = {
      gameId: 'game-A',
      players: [],
      seasonArchives: [],
    };
    mockState.remoteConfig.config = null;
    mockDispatch.mockReset();
    mockNavigate.mockReset();
    preloadImageMock.mockReset();
    preloadImageMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as Window & { game?: Record<string, unknown> }).game;
  });

  it('shows the Kolequant splash only once per game when returning home mid-game', async () => {
    const firstRender = renderHomeHub();

    expect(screen.getByTestId('kolequant-splash')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('kolequant-splash'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    firstRender.unmount();

    renderHomeHub();

    expect(screen.queryByTestId('kolequant-splash')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });
  });

  it('shows the Kolequant splash again after a new season starts', async () => {
    const firstRender = renderHomeHub();

    fireEvent.click(screen.getByTestId('kolequant-splash'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    firstRender.unmount();
    mockState.game.gameId = 'game-B';

    renderHomeHub();

    await waitFor(() => {
      expect(screen.getByTestId('kolequant-splash')).toBeInTheDocument();
    });
  });

  it('does not show the Kolequant splash when the current game was already seen', async () => {
    localStorage.setItem('bb:homeHubSplashLastGameId', 'game-A');

    renderHomeHub();

    expect(screen.queryByTestId('kolequant-splash')).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });
  });

  it('preloads a later remote background before showing buttons again', async () => {
    const OriginalImage = window.Image;
    class ReadyImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }
    window.Image = ReadyImage as unknown as typeof Image;

    let resolveInitialBg = () => {};
    let resolveRemoteBg = () => {};
    preloadImageMock.mockImplementation((url: string) => new Promise<void>((resolve) => {
      if (url === '/assets/background.jpg') {
        resolveInitialBg = resolve;
        return;
      }
      if (url === 'https://example.com/remote-bg.jpg') {
        resolveRemoteBg = resolve;
        return;
      }
      resolve();
    }));

    try {
      const view = renderHomeHub();

      fireEvent.click(screen.getByTestId('kolequant-splash'));
      expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

      await act(async () => {
        resolveInitialBg();
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      });

      mockState.remoteConfig.config = {
        season: {
          introHub: {
            backgroundImageUrl: 'https://example.com/remote-bg.jpg',
          },
        },
      };
      view.rerender(
        <MemoryRouter>
          <HomeHub />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(preloadImageMock).toHaveBeenCalledWith('https://example.com/remote-bg.jpg');
      });
      expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

      await act(async () => {
        resolveRemoteBg();
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      });
    } finally {
      window.Image = OriginalImage;
    }
  });

  it('falls back to the local background when the remote intro-hub image fails to load', async () => {
    const OriginalImage = window.Image;
    class ErrorImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(_value: string) {
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }
    window.Image = ErrorImage as unknown as typeof Image;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      mockState.remoteConfig.config = {
        season: {
          introHub: {
            backgroundImageUrl: 'https://example.com/remote-bg.webp',
          },
        },
      };

      renderHomeHub();

      fireEvent.click(screen.getByTestId('kolequant-splash'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      });

      const bgLayer = document.querySelector<HTMLElement>('.homehub-intro-bg');
      expect(bgLayer?.style.backgroundImage).toContain('/assets/background.jpg');
      expect(bgLayer?.style.backgroundImage).not.toContain('remote-bg.webp');
    } finally {
      warnSpy.mockRestore();
      window.Image = OriginalImage;
    }
  });

  it('keeps the Kolequant splash up until the full hub bundle is ready', async () => {
    const pendingResolvers: Array<() => void> = [];
    preloadImageMock.mockImplementation(() => new Promise<void>((resolve) => {
      pendingResolvers.push(resolve);
    }));

    const view = renderHomeHub();

    fireEvent.click(screen.getByTestId('kolequant-splash'));

    expect(screen.getByTestId('kolequant-splash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

    await act(async () => {
      while (pendingResolvers.length > 0) {
        pendingResolvers.splice(0).forEach((resolve) => resolve());
        await Promise.resolve();
      }
    });
    view.rerender(
      <MemoryRouter>
        <HomeHub />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('kolequant-splash')).toBeNull();
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });
  });

  it('auto-starts the game preloader when returning from Game Over with autoStartGame state', async () => {
    renderHomeHub({ pathname: '/', state: { autoStartGame: true } });

    await waitFor(() => {
      expect(screen.getByTestId('asset-preloader-overlay')).toBeInTheDocument();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows Survival rules before starting a fresh Survival run', async () => {
    const view = renderHomeHub();

    fireEvent.click(screen.getByTestId('kolequant-splash'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Survival Mode' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/don't show this again/i));
    fireEvent.click(screen.getByRole('button', { name: 'Enter Survival' }));

    await waitFor(() => {
      expect(
        mockDispatch.mock.calls.some(
          ([action]) => typeof action === 'object' && action !== null && (action as { type?: string }).type === 'game/hydrateGame',
        ),
      ).toBe(true);
    });
    expect(localStorage.getItem('bb:homeHubSurvivorRulesSeen:guest')).toBe('1');

    view.unmount();
  });

  it('mirrors the current Redux game state onto window.game for the intro hub', async () => {
    mockState.game = {
      gameId: 'game-A',
      season: 4,
      week: 7,
      phase: 'nominations',
      players: [{ id: 'user', isUser: true }],
      seasonArchives: [{ seasonId: 'season-3' }],
    };
    (window as Window & { game?: Record<string, unknown> }).game = {
      hubNotifications: { news: true },
    };

    renderHomeHub();

    await waitFor(() => {
      expect((window as Window & { game?: Record<string, unknown> }).game).toMatchObject({
        hubNotifications: { news: true },
        season: 4,
        day: 7,
        week: 7,
        phase: 'nominations',
        players: [{ id: 'user', isUser: true }],
        seasonArchives: [{ seasonId: 'season-3' }],
        achievementSummary: {
          playerName: 'You',
          totals: {
            seasonsPlayed: 1,
          },
        },
      });
    });
  });
});
