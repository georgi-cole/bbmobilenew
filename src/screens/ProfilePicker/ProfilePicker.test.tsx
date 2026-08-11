import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePicker from './ProfilePicker';

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
let mockLocationState: { from?: string } | null = null;

const persistenceMocks = vi.hoisted(() => ({
  getLastPlayedRun: vi.fn(),
  clearSavedRunProfile: vi.fn(),
  suspendRunSnapshotAutosave: vi.fn(),
  releaseAutosave: vi.fn(),
  invalidateRunSnapshotAutosaves: vi.fn(),
}));

persistenceMocks.suspendRunSnapshotAutosave.mockImplementation(() => persistenceMocks.releaseAutosave);

const mockState = {
  profiles: { profiles: [] as Array<{ id: string; name: string; avatar: string; createdAt: string; photoId?: string }>, activeProfileId: null as string | null, isGuest: false },
  game: { week: 1, phase: 'week_start', status: 'active' },
};

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));
vi.mock('../../store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
vi.mock('../../store/archivePersistence', () => ({ loadSeasonArchives: vi.fn(() => []) }));
vi.mock('../../store/saveStatePersistence', () => ({
  getLastPlayedRun: persistenceMocks.getLastPlayedRun,
  clearSavedRunProfile: persistenceMocks.clearSavedRunProfile,
}));
vi.mock('../../store/runSnapshotAutosave', () => ({
  suspendRunSnapshotAutosave: persistenceMocks.suspendRunSnapshotAutosave,
  invalidateRunSnapshotAutosaves: persistenceMocks.invalidateRunSnapshotAutosaves,
}));
vi.mock('../../utils/imageDb', () => ({
  imageIdToDataUrl: vi.fn(() => Promise.resolve(null)),
  saveImage: vi.fn(() => Promise.resolve()),
  deleteImage: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../utils/imageUtils', () => ({ resizeAndCompressImage: vi.fn() }));
vi.mock('../../components/ConfirmExitModal/ConfirmExitModal', () => ({ default: () => null }));

describe('ProfilePicker', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockDispatch.mockReset();
    mockLocationState = null;
    Object.values(persistenceMocks).forEach((mock) => mock.mockReset());
    persistenceMocks.suspendRunSnapshotAutosave.mockImplementation(() => persistenceMocks.releaseAutosave);
    mockState.profiles = { profiles: [], activeProfileId: null, isGuest: false };
    mockState.game = { week: 1, phase: 'week_start', status: 'active' };
  });

  it('initializes a newly created profile without autosaving the reset state', async () => {
    render(<ProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: /create new profile/i }));
    fireEvent.change(screen.getByPlaceholderText(/enter display name/i), { target: { value: 'Jordan' } });
    fireEvent.click(screen.getByRole('button', { name: /create profile/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);
    expect(persistenceMocks.releaseAutosave).toHaveBeenCalledTimes(1);
  });

  it('goes home without resetting the current run', () => {
    mockLocationState = { from: '/' };
    render(<ProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: /back to home/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('hydrates a modern saved run when switching profiles', () => {
    mockState.game = { week: 1, phase: 'week_start', status: 'paused' };
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'A', avatar: 'A', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'B', avatar: 'B', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    };
    persistenceMocks.getLastPlayedRun.mockReturnValue({
      version: 1, profileId: 'profile-b', savedAt: '2026-08-10T12:00:00.000Z',
      game: { mode: 'classic', status: 'active', week: 7, phase: 'social_1', players: [] }, finale: {}, social: {},
    });
    render(<ProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(persistenceMocks.getLastPlayedRun).toHaveBeenCalledWith('profile-b');
    expect(mockDispatch.mock.calls.some(([action]) => action?.type === 'game/hydrateGame')).toBe(true);
    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('resets an empty target profile only while autosave is suspended', () => {
    mockState.game = { week: 1, phase: 'week_start', status: 'paused' };
    mockState.profiles = {
      profiles: [
        { id: 'profile-a', name: 'A', avatar: 'A', createdAt: '2026-08-01T00:00:00.000Z' },
        { id: 'profile-b', name: 'B', avatar: 'B', createdAt: '2026-08-02T00:00:00.000Z' },
      ],
      activeProfileId: 'profile-a',
      isGuest: false,
    };
    persistenceMocks.getLastPlayedRun.mockReturnValue(null);
    render(<ProfilePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(mockDispatch.mock.calls.some(([action]) => action?.type === 'game/resetGame')).toBe(true);
    expect(persistenceMocks.suspendRunSnapshotAutosave).toHaveBeenCalledTimes(1);
  });
});
