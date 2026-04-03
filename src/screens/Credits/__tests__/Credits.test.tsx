import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Credits from '../Credits';
import { buildCreditsAssetCandidates, CREDITS_POSTER_SOURCES, CREDITS_VIDEO_SOURCES } from '../creditsAssetPaths';

function renderCredits() {
  return render(
    <MemoryRouter initialEntries={['/credits']}>
      <Routes>
        <Route path="/credits" element={<Credits />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Credits', () => {
  it('renders a mobile-friendly video player with a loading state', async () => {
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const { container } = renderCredits();
    const video = container.querySelector('video');

    expect(screen.getByRole('status')).toHaveTextContent('Loading credits…');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('src')).toBe(CREDITS_VIDEO_SOURCES[0] ?? buildCreditsAssetCandidates('assets/endcreditskq.mp4')[0]);
    expect(video!.getAttribute('poster')).toBe(CREDITS_POSTER_SOURCES[0] ?? buildCreditsAssetCandidates('assets/kolequant.png')[0]);
    expect(video!.hasAttribute('controls')).toBe(true);
    expect(video!.hasAttribute('playsinline')).toBe(true);
    expect(video!.getAttribute('preload')).toBe('metadata');
    expect(video!.muted).toBe(true);

    fireEvent.loadedMetadata(video!);

    expect(screen.queryByRole('status')).toBeNull();
    expect(playMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tap for sound' })).toBeInTheDocument();
    });
  });

  it('starts muted and lets the user enable sound with a tap', async () => {
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const { container } = renderCredits();
    const video = container.querySelector('video')!;

    fireEvent.loadedMetadata(video);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tap for sound' })).toBeInTheDocument();
    });
    expect(video.muted).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tap for sound' }));

    await waitFor(() => {
      expect(video.muted).toBe(false);
    });
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Tap for sound' })).toBeNull();
  });

  it('retries a fallback source and then shows an error state if loading still fails', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderCredits();
    const candidates = buildCreditsAssetCandidates('assets/endcreditskq.mp4');
    const posterCandidates = buildCreditsAssetCandidates('assets/kolequant.png');

    fireEvent.error(container.querySelector('video')!);

    if (candidates.length > 1) {
      expect(consoleWarn).toHaveBeenCalledWith(
        '[Credits] Failed to load video source, retrying fallback source.',
        expect.objectContaining({
          attemptedSource: candidates[0],
          nextSource: candidates[1],
        }),
      );
      expect(screen.getByRole('status')).toHaveTextContent('Retrying video load…');
      expect(container.querySelector('video')!.getAttribute('poster')).toBe(posterCandidates[1]);

      fireEvent.error(container.querySelector('video')!);
    }

    expect(consoleError).toHaveBeenCalledWith(
      '[Credits] Failed to load credits video.',
      expect.objectContaining({
        attemptedSource: candidates[candidates.length - 1],
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Credits video could not be loaded on this device. You can retry or skip.',
    );
    expect(screen.getByRole('button', { name: 'Retry video' })).toBeInTheDocument();
  });

  it('returns home when the credits finish', () => {
    const { container } = renderCredits();

    fireEvent.ended(container.querySelector('video')!);
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('returns home when the user skips the credits', () => {
    renderCredits();

    fireEvent.click(screen.getByRole('button', { name: 'Skip credits (Esc)' }));
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
