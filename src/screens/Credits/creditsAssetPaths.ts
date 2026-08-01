const CREDITS_CITY_PATH = 'assets/credits/city.png'
const CREDITS_BIG_EYE_PATH = 'assets/credits/big-eye.svg'
const CREDITS_MOON_PATH = 'assets/credits/moon.svg'
const CREDITS_VIDEO_PATH = 'assets/credits/big-eye-cinematic-background.mp4'
const CREDITS_POSTER_PATH = 'assets/splash-city-skyline-photographic.png'

function normalizeCreditsAssetUrl(candidate: string): string {
  if (typeof document === 'undefined') {
    return candidate
  }

  try {
    return new URL(candidate, document.baseURI).toString()
  } catch {
    return candidate
  }
}

export function buildCreditsAssetCandidates(assetPath: string): string[] {
  const candidates = new Set<string>()
  const viteBase = import.meta.env.BASE_URL ?? ''
  const normalizedViteBase = viteBase ? `${viteBase.replace(/\/$/, '')}/` : ''

  candidates.add(normalizeCreditsAssetUrl(assetPath))
  if (normalizedViteBase) {
    candidates.add(normalizeCreditsAssetUrl(`${normalizedViteBase}${assetPath}`))
  }

  return [...candidates]
}

export const CREDITS_CITY_SOURCES = buildCreditsAssetCandidates(CREDITS_CITY_PATH)
export const CREDITS_BIG_EYE_SOURCES = buildCreditsAssetCandidates(CREDITS_BIG_EYE_PATH)
export const CREDITS_MOON_SOURCES = buildCreditsAssetCandidates(CREDITS_MOON_PATH)
export const CREDITS_VIDEO_SOURCES = buildCreditsAssetCandidates(CREDITS_VIDEO_PATH)
export const CREDITS_POSTER_SOURCES = buildCreditsAssetCandidates(CREDITS_POSTER_PATH)
