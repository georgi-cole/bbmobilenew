import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomeHub from '../HomeHub';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockState = {
  game: {
    gameId: 'game-A',
  },
  profiles: {
    activeProfileId: null,
    isGuest: true,
    profiles: [],
  },
};

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
    mockState.game.gameId = 'game-A';
    mockDispatch.mockReset();
    mockNavigate.mockReset();
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
});
