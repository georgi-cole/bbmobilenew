import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePicker from './ProfilePicker';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();

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

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));

vi.mock('../../store/archivePersistence', () => ({
  loadSeasonArchives: vi.fn(() => []),
}));

vi.mock('../../store/saveStatePersistence', () => ({
  savedStateKeyForProfile: vi.fn((id: string) => `save:${id}`),
  loadSeasonSnapshot: vi.fn(() => null),
  clearSeasonSnapshot: vi.fn(),
}));

vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),
  deleteImage: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({
  default: () => null,
}));

describe('ProfilePicker', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockDispatch.mockReset();
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

  it('replaces the picker history entry after creating a profile', () => {
    render(<ProfilePicker />);

    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }));
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), {
      target: { value: 'Jordan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/profile', { replace: true });
  });

  it('shows a direct way back home from the picker', () => {
    render(<ProfilePicker />);

    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
