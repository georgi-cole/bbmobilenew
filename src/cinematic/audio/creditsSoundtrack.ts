import { CINEMATIC_AUDIO, CINEMATIC_CONFIG } from '../config/cinematicConfig';

let soundtrack: HTMLAudioElement | null = null;
let volumeAnimationFrame: number | null = null;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const cancelVolumeAnimation = () => {
  if (volumeAnimationFrame != null) {
    window.cancelAnimationFrame(volumeAnimationFrame);
    volumeAnimationFrame = null;
  }
};

const seekToConfiguredStart = (audio: HTMLAudioElement) => {
  audio.currentTime = CINEMATIC_AUDIO.sourceStartInSeconds;
};

const updateSoundtrackVolume = () => {
  if (soundtrack == null || soundtrack.paused) {
    volumeAnimationFrame = null;
    return;
  }

  const elapsed = soundtrack.currentTime - CINEMATIC_AUDIO.sourceStartInSeconds;
  const duration = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps;
  const fadeIn = clamp01(elapsed / CINEMATIC_AUDIO.fadeInSeconds);
  const fadeOut = clamp01((duration - elapsed) / CINEMATIC_AUDIO.fadeOutSeconds);
  soundtrack.volume = CINEMATIC_AUDIO.volume * Math.min(fadeIn, fadeOut);

  if (elapsed >= duration) {
    soundtrack.pause();
    volumeAnimationFrame = null;
    return;
  }

  volumeAnimationFrame = window.requestAnimationFrame(updateSoundtrackVolume);
};

export const prepareCreditsSoundtrack = (): HTMLAudioElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const source = new URL(CINEMATIC_AUDIO.source, document.baseURI).toString();
  if (soundtrack?.src === source) {
    return soundtrack;
  }

  soundtrack = new Audio(source);
  soundtrack.preload = 'auto';
  soundtrack.volume = 0;
  soundtrack.load();
  return soundtrack;
};

export const startCreditsSoundtrackFromGesture = (): Promise<void> => {
  const audio = prepareCreditsSoundtrack();
  if (audio == null) {
    return Promise.reject(new Error('Credits soundtrack is unavailable.'));
  }

  cancelVolumeAnimation();
  audio.pause();
  audio.volume = 0;

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekToConfiguredStart(audio);
  } else {
    audio.addEventListener('loadedmetadata', () => {
      seekToConfiguredStart(audio);
    }, { once: true });
  }

  const playback = audio.play();
  void playback
    .then(() => {
      volumeAnimationFrame = window.requestAnimationFrame(updateSoundtrackVolume);
    })
    .catch(() => {
      // The caller handles playback failures; this branch prevents a duplicate unhandled rejection.
    });
  return playback;
};

export const isCreditsSoundtrackPlaying = (): boolean =>
  soundtrack != null && !soundtrack.paused && !soundtrack.ended;

export const getCreditsSoundtrackFrame = (): number => {
  if (soundtrack == null) {
    return 0;
  }

  const elapsed = Math.max(0, soundtrack.currentTime - CINEMATIC_AUDIO.sourceStartInSeconds);
  return Math.min(
    CINEMATIC_CONFIG.durationInFrames - 1,
    Math.round(elapsed * CINEMATIC_CONFIG.fps),
  );
};

export const stopCreditsSoundtrack = () => {
  cancelVolumeAnimation();
  if (soundtrack == null) {
    return;
  }

  soundtrack.pause();
  soundtrack.volume = 0;
  if (soundtrack.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekToConfiguredStart(soundtrack);
  }
};
