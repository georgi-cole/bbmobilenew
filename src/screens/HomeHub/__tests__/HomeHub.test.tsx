import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    players?: Array<{ id: string; isUser?: boolean }>;
    seasonArchives?: Array<{ seasonId: string }>;
  };
  profiles: { activeProfileId: null; isGuest: boolean; profiles: never[] };
  remoteConfig: { config: RemoteConfig | null };
} = {
  game: {
    gameId: 'game-A',
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

vi.mock('../../../hooks/useLoadIntroHub', () => ({
  default: () => undefined,
}));

vi.mock('../../../hooks/useIntroHubMusic', () => ({
  default: () => undefined,
}));

vi.mock('../../../utils/preload', () => ({
  preloadImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../components/KolequantSplash/KolequantSplash', () => ({
  default: ({ onFinish }: { onFinish?: () => void }) => (
    <button data-testid="kolequant-splash" onClick={onFinish} type="button">
      Finish splash
    </button>
  ),
}));

vi.mock('../../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}));

vi.mock('../../../components/PermissionPrompts/PermissionPrompts', () => ({
  default: () => <div data-testid="permission-prompts" />,
}));

vi.mock('../../../components/SoundConsentPopup/SoundConsentPopup', () => ({
  HUB_MUSIC_CONSENT_KEY: 'bb:hubMusicConsent',
  default: () => <div data-testid="sound-consent-popup" />,
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

function renderHomeHub() {
  return render(
    <MemoryRouter>
      <HomeHub />
    </MemoryRouter>,
  );
}

describe('HomeHub', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('bb:hubMusicConsent', 'granted');
    mockState.game = {
      gameId: 'game-A',
    };
    mockState.remoteConfig.config = null;
    mockDispatch.mockReset();
    mockNavigate.mockReset();
    preloadImageMock.mockReset();
    preloadImageMock.mockResolvedValue(undefined);
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

    const view = renderHomeHub();

    fireEvent.click(screen.getByTestId('kolequant-splash'));
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

    resolveInitialBg();
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

    expect(preloadImageMock).toHaveBeenCalledWith('https://example.com/remote-bg.jpg');
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();

    resolveRemoteBg();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });
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
        week: 7,
        phase: 'nominations',
        seasonArchives: [{ seasonId: 'season-3' }],
      });
    });
  });
});
