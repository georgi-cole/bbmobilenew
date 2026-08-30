import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePicker from './ProfilePicker';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockLoadSavedRunProfile = vi.fn();
let mockLocationState: { from?: string } | null = null;

const mockState: {
  profiles: {
    profiles: Array<{
      id: string;
      name: string;
      avatar: string;
      createdAt: string;
      photoId?: string;
    }>;
    activeProfileId: string | null;
    isGuest: boolean;
  };
  game: {
    status?: string;
    week: number;
    phase: string;
  };
} = {
  profiles: {
    profiles: [],
    activeProfileId: null,
    isGuest: false,
  },
  game: {
    week: 1,
    phase: 'week_start',
  },
};

function emptySavedProfile(profileId: string) {
  return {
    version: 2 as const,
    profileId,
    savedAt: new Date(0).toISOString(),
    activeRunId: null,
    lastPlayedRunId: null,
    runs: {},
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
  };
}

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

vi.mock('../../store/archivePersistence', () => ({
  loadSeasonArchives: vi.fn(() => []),
}));

vi.mock('../../store/saveStatePersistence', () => ({
  loadSavedRunProfile: (...args: unknown[]) => mockLoadSavedRunProfile(...args),
  clearSavedRun: vi.fn(),
}));

vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),
  saveImage: vi.fn(() => Promise.resolve()),
  deleteImage: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../utils/imageUtils', () => ({
  resizeAndCompressImage: vi.fn(),
}));

vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}));

describe('ProfilePicker', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockDispatch.mockReset();
    mockLoadSavedRunProfile.mockReset();
    mockLoadSavedRunProfile.mockImplementation((id: string) => emptySavedProfile(id));
    mockLocationState = null;
    mockState.profiles = {
      profiles: [],
      activeProfileId: null,
      isGuest: false,
    };
    mockState.game = {
      week: 1,
      phase: 'week_start',
    };
  });

  it('replaces the picker history entry after creating a profile', async () => {
    render(<ProfilePicker />);

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }));
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true, state: { from: '/game' } });
    });
  });

  it('shows a direct way back home from the picker', () => {
    mockLocationState = { from: '/' };
    render(<ProfilePicker />);

    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('checks the modern split-save profile before switching profiles', () => {
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'A', avatar: '🧑', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'B', avatar: '👩', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    };

    render(<ProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(mockLoadSavedRunProfile).toHaveBeenCalledWith('profile-b');
    expect(mockNavigate).toHaveBeenCalledWith('/profile', {
      replace: true,
      state: { from: '/game' },
    });
  });
});
