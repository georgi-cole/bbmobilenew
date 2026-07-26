import { SOUND_REGISTRY } from './sounds';

const PUBLIC_VOTING_SOUND_KEY = 'music:public_voting';
const AUDIO_METADATA_TIMEOUT_MS = 5000;
const MIN_VALID_DURATION_MS = 1000;
const MIN_ELIMINATION_INTERVAL_MS = 250;

let cachedSource: string | null = null;
let cachedDurationPromise: Promise<number | null> | null = null;

function readAudioDurationMs(src: string): Promise<number | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;

    const finish = (durationMs: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('durationchange', handleMetadata);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      resolve(durationMs);
    };

    const handleMetadata = () => {
      const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
      finish(durationMs >= MIN_VALID_DURATION_MS ? durationMs : null);
    };
    const handleError = () => finish(null);
    const timeoutId = window.setTimeout(() => finish(null), AUDIO_METADATA_TIMEOUT_MS);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('durationchange', handleMetadata);
    audio.addEventListener('error', handleError);
    audio.src = src;
    audio.load();
  });
}

/**
 * Reads the duration of the sound currently registered for the public-vote
 * sequence. The cache is keyed by the registry source, so replacing or
 * redirecting the music asset automatically changes the next app session's
 * timing without another hard-coded duration update.
 */
export function getPublicVotingAudioDurationMs(): Promise<number | null> {
  const source = SOUND_REGISTRY[PUBLIC_VOTING_SOUND_KEY]?.src;
  if (!source) return Promise.resolve(null);

  if (cachedDurationPromise && cachedSource === source) return cachedDurationPromise;

  cachedSource = source;
  cachedDurationPromise = readAudioDurationMs(source).then((durationMs) => {
    if (durationMs === null) {
      cachedSource = null;
      cachedDurationPromise = null;
    }
    return durationMs;
  });
  return cachedDurationPromise;
}

/** Warm the metadata cache well before the finale reaches the public vote. */
export function preloadPublicVotingAudioDuration(): void {
  void getPublicVotingAudioDurationMs();
}

/**
 * Spaces every elimination evenly across the full music file. The final
 * elimination — which determines the winner — therefore lands at the end of
 * the track regardless of candidate count or a later replacement audio file.
 */
export function calculatePublicVotingEliminationIntervalMs(
  audioDurationMs: number | null,
  candidateCount: number,
  fallbackIntervalMs: number,
): number {
  if (
    audioDurationMs === null ||
    !Number.isFinite(audioDurationMs) ||
    audioDurationMs < MIN_VALID_DURATION_MS ||
    candidateCount < 2
  ) {
    return fallbackIntervalMs;
  }

  const eliminationCount = candidateCount - 1;
  return Math.max(
    MIN_ELIMINATION_INTERVAL_MS,
    Math.round(audioDurationMs / eliminationCount),
  );
}
