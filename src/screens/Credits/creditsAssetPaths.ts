const CREDITS_CITY_PATH = 'assets/credits/city.png';
const CREDITS_BIG_EYE_PATH = 'assets/credits/big-eye.svg';
const CREDITS_MOON_PATH = 'assets/credits/moon.svg';

function normalizeCreditsAssetUrl(candidate: string): string {
  if (typeof document === 'undefined') {
    return candidate;
  }

  try {
    return new URL(candidate, document.baseURI).toString();
  } catch {
    return candidate;
  }
}

export function buildCreditsAssetCandidates(assetPath: string): string[] {
  const candidates = new Set<string>();
  const viteBase = import.meta.env.BASE_URL ?? '';
  const normalizedViteBase = viteBase ? `${viteBase.replace(/\/$/, '')}/` : '';

  candidates.add(normalizeCreditsAssetUrl(assetPath));
  if (normalizedViteBase) {
    candidates.add(normalizeCreditsAssetUrl(`${normalizedViteBase}${assetPath}`));
  }

  return [...candidates];
}

export const CREDITS_CITY_SOURCES = buildCreditsAssetCandidates(CREDITS_CITY_PATH);
export const CREDITS_BIG_EYE_SOURCES = buildCreditsAssetCandidates(CREDITS_BIG_EYE_PATH);
export const CREDITS_MOON_SOURCES = buildCreditsAssetCandidates(CREDITS_MOON_PATH);
