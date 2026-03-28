import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AudioGate from '../AudioGate';
import { SoundManager } from '../../../services/sound/SoundManager';

describe('AudioGate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render a visible enable-audio overlay', () => {
    render(<AudioGate promptText="Tap anywhere to enable audio" />);

    expect(screen.queryByRole('button', { name: /enable audio/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tap anywhere to enable audio/i)).not.toBeInTheDocument();
  });

  it('still unlocks audio on the first document click without showing UI', () => {
    const unlockSpy = vi.spyOn(SoundManager, 'unlockOnUserGesture').mockImplementation(() => {});
    const onUnlock = vi.fn();

    render(<AudioGate onUnlock={onUnlock} />);

    fireEvent.click(document.body);
    fireEvent.click(document.body);

    expect(unlockSpy).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
