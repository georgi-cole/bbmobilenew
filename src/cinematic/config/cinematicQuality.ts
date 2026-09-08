export type CinematicQuality = 'high' | 'balanced' | 'performance'

type NavigatorWithMemory = Navigator & { deviceMemory?: number }

export interface CinematicDeviceProfile {
  isPlayer: boolean
  cores: number
  memory: number
  coarsePointer: boolean
  compactViewport: boolean
}

export function selectCinematicQuality({
  isPlayer,
  cores,
  memory,
  coarsePointer,
  compactViewport,
}: CinematicDeviceProfile): CinematicQuality {
  if (!isPlayer) return 'high'

  const constrainedHardware = cores <= 4 || memory <= 4
  if (coarsePointer || compactViewport || constrainedHardware) return 'performance'
  if (cores <= 8 || memory <= 8) return 'balanced'
  return 'high'
}

export const getCinematicQuality = (isPlayer: boolean): CinematicQuality => {
  if (!isPlayer || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'high'
  }

  const device = navigator as NavigatorWithMemory
  return selectCinematicQuality({
    isPlayer,
    cores: device.hardwareConcurrency ?? 8,
    memory: device.deviceMemory ?? 8,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    compactViewport: Math.min(window.innerWidth, window.innerHeight) <= 900,
  })
}
