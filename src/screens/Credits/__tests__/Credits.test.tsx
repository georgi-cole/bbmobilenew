import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Credits from '../Credits';

const { initMock, destroyMock, creditsSceneMock } = vi.hoisted(() => {
  const init = vi.fn();
  const destroy = vi.fn();
  const scene = vi.fn(function MockCreditsScene() {
    return {
      init,
      destroy,
    };
  });

  return {
    initMock: init,
    destroyMock: destroy,
    creditsSceneMock: scene,
  };
});

vi.mock('../CreditsScene', () => ({
  default: creditsSceneMock,
}));

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

describe('Credits', () => {
  beforeEach(() => {
    initMock.mockReset();
    destroyMock.mockReset();
    creditsSceneMock.mockClear();
    initMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the Pixi credits scene and exits on tap after init', async () => {
    renderCredits();

    expect(screen.getByRole('status')).toHaveTextContent('Loading credits…');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tap to exit credits' })).toBeInTheDocument();
    });

    expect(creditsSceneMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(creditsSceneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        credits: expect.arrayContaining([
          'Thank YOU for playing',
          'Created by:\nGeorgi Cole',
        ]),
      }),
    );

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Tap to exit credits' }));
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('shows a retryable error state if the scene fails to initialize', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    initMock.mockRejectedValueOnce(new Error('canvas failed')).mockResolvedValueOnce(undefined);

    renderCredits();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Credits unavailable on this device. You can retry or go back.',
      );
    });

    expect(consoleError).toHaveBeenCalledWith(
      '[CreditsScene] canvas init error',
      expect.objectContaining({ message: 'canvas failed' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry scene' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tap to exit credits' })).toBeInTheDocument();
    });

    expect(creditsSceneMock).toHaveBeenCalledTimes(2);
  });

  it('destroys the scene when the screen unmounts or exits', async () => {
    renderCredits();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tap to exit credits' })).toBeInTheDocument();
    });

    vi.useFakeTimers();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
      vi.advanceTimersByTime(420);
    });

    expect(screen.getByText('Home screen')).toBeInTheDocument();
    expect(destroyMock).toHaveBeenCalled();
  });
});
