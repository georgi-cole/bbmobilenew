export type CinematicQuality = 'high' | 'balanced' | 'performance'

type NavigatorWithMemory = Navigator & { deviceMemory?: number }

export const getCinematicQuality = (isPlayer: boolean): CinematicQuality => {
  if (!isPlayer || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'high'
  }

  const device = navigator as NavigatorWithMemory
  const cores = device.hardwareConcurrency ?? 8
  const memory = device.deviceMemory ?? 8
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const compactViewport = Math.min(window.innerWidth, window.innerHeight) <= 900
  const constrainedHardware = cores <= 4 || memory <= 4

  // The app's phone-shaped playback surface is where live WebGL was visibly
  // stuttering. Use the DOM-based adaptive renderer there and on weak devices.
  if (coarsePointer || compactViewport || constrainedHardware) return 'performance'

  if (cores <= 8 || memory <= 8) return 'balanced'
  return 'high'
}
