export interface CinematicAudioController {
  play: () => void;
  fadeOutAndStop: (durationMs: number) => void;
  dispose: () => void;
}

const DEFAULT_FADE_STEP_MS = 50;
const MIN_FADE_INTERVAL_MS = 16;
const RETRY_EVENTS: Array<keyof DocumentEventMap> = ['click', 'keydown', 'touchstart'];

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

function isAutoplayBlocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'NotAllowedError'
  );
}

export function createCinematicAudio(
  src: string,
  volume = 1,
  options: { loop?: boolean } = {},
): CinematicAudioController {
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
  audio.loop = options.loop ?? false;

  let fadeTimer: number | null = null;
  let retryHandler: (() => void) | null = null;
  let playAttemptToken = 0;

  const clearFadeTimer = () => {
    if (fadeTimer != null) {
      window.clearInterval(fadeTimer);
      fadeTimer = null;
    }
  };

  const clearRetryHandler = () => {
    if (typeof document === 'undefined') {
      retryHandler = null;
      return;
    }
    if (retryHandler == null) {
      return;
    }
    for (const eventName of RETRY_EVENTS) {
      document.removeEventListener(eventName, retryHandler, true);
    }
    retryHandler = null;
  };

  const attemptPlay = () => {
    const attemptToken = ++playAttemptToken;
    clearFadeTimer();
    clearRetryHandler();
    audio.currentTime = 0;
    audio.volume = baseVolume;
    void audio.play().catch((error: unknown) => {
      if (attemptToken !== playAttemptToken) {
        return;
      }
      if (isAutoplayBlocked(error) && typeof document !== 'undefined') {
        if (retryHandler != null) {
          return;
        }
        retryHandler = () => {
          attemptPlay();
        };
        for (const eventName of RETRY_EVENTS) {
          document.addEventListener(eventName, retryHandler, true);
        }
      }
    });
  };

  const stop = () => {
    clearFadeTimer();
    clearRetryHandler();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = baseVolume;
  };

  return {
    play: attemptPlay,
    fadeOutAndStop: (durationMs: number) => {
      clearFadeTimer();
      clearRetryHandler();

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
