export type CinematicQuality = 'high' | 'balanced';

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

export const getCinematicQuality = (isPlayer: boolean): CinematicQuality => {
  if (!isPlayer || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'high';
  }

  const device = navigator as NavigatorWithMemory;
  const cores = device.hardwareConcurrency ?? 8;
  const memory = device.deviceMemory ?? 8;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const compactViewport = Math.min(window.innerWidth, window.innerHeight) <= 900;

  return coarsePointer || compactViewport || cores <= 4 || memory <= 4
    ? 'balanced'
    : 'high';
};
