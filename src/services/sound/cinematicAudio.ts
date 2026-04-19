export interface CinematicAudioController {
  play: () => void;
  fadeOutAndStop: (durationMs: number) => void;
  dispose: () => void;
}

const DEFAULT_FADE_STEP_MS = 50;
const MIN_FADE_INTERVAL_MS = 16;

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export function createCinematicAudio(src: string, volume = 1): CinematicAudioController {
  if (typeof Audio === 'undefined') {
    return {
      play: () => {},
      fadeOutAndStop: () => {},
      dispose: () => {},
    };
  }

  const audio = new Audio(src);
  const baseVolume = clampVolume(volume);
  audio.preload = 'auto';
  audio.volume = baseVolume;

  let fadeTimer: number | null = null;

  const clearFadeTimer = () => {
    if (fadeTimer != null) {
      window.clearInterval(fadeTimer);
      fadeTimer = null;
    }
  };

  const stop = () => {
    clearFadeTimer();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = baseVolume;
  };

  return {
    play: () => {
      clearFadeTimer();
      audio.currentTime = 0;
      audio.volume = baseVolume;
      void audio.play().catch(() => {});
    },
    fadeOutAndStop: (durationMs: number) => {
      clearFadeTimer();

      if (durationMs <= 0 || audio.paused || audio.ended) {
        stop();
        return;
      }

      const startingVolume = audio.volume;
      const steps = Math.max(1, Math.ceil(durationMs / DEFAULT_FADE_STEP_MS));
      const intervalMs = Math.max(MIN_FADE_INTERVAL_MS, Math.floor(durationMs / steps));
      let step = 0;

      fadeTimer = window.setInterval(() => {
        step += 1;
        audio.volume = clampVolume(startingVolume * (1 - step / steps));

        if (step >= steps) {
          stop();
        }
      }, intervalMs);
    },
    dispose: () => {
      stop();
      audio.removeAttribute('src');
      audio.load();
    },
  };
}
