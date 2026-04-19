import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCinematicAudio } from '../../../src/services/sound/cinematicAudio';

class MockAudio {
  currentTime = 0;
  volume = 1;
  preload = '';
  paused = true;
  ended = false;
  play = vi.fn<() => Promise<void>>();
  pause = vi.fn(() => {
    this.paused = true;
  });
  removeAttribute = vi.fn();
  load = vi.fn();
}

function installAudioConstructor(audio: MockAudio): void {
  class AudioStub {
    constructor(_src?: string) {
      return audio;
    }
  }

  globalThis.Audio = AudioStub as unknown as typeof Audio;
}

describe('createCinematicAudio', () => {
  const OriginalAudio = globalThis.Audio;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.Audio = OriginalAudio;
  });

  it('retries playback on the next user gesture after autoplay is blocked', async () => {
    const audio = new MockAudio();
    const autoplayBlocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    audio.play
      .mockRejectedValueOnce(autoplayBlocked)
      .mockImplementation(async () => {
        audio.paused = false;
      });
    installAudioConstructor(audio);

    const controller = createCinematicAudio('/assets/final_recap_sound.mp3');
    controller.play();
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(audio.play).toHaveBeenCalledTimes(2);
  });

  it('clears the pending autoplay retry when disposed', async () => {
    const audio = new MockAudio();
    const autoplayBlocked = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
    audio.play.mockRejectedValueOnce(autoplayBlocked);
    installAudioConstructor(audio);

    const controller = createCinematicAudio('/assets/final_recap_sound.mp3');
    controller.play();
    await Promise.resolve();

    controller.dispose();
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.removeAttribute).toHaveBeenCalledWith('src');
    expect(audio.load).toHaveBeenCalled();
  });
});
