const CREDITS_VIDEO_PATH = 'assets/endcreditskq.mp4';
const CREDITS_POSTER_PATH = 'assets/kolequant.png';

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

  candidates.add(normalizeCreditsAssetUrl(assetPath));
  if (viteBase) {
    candidates.add(normalizeCreditsAssetUrl(`${viteBase.replace(/\/?$/, '/')}${assetPath}`));
  }

  return [...candidates];
}

export const CREDITS_VIDEO_SOURCES = buildCreditsAssetCandidates(CREDITS_VIDEO_PATH);
export const CREDITS_POSTER_SOURCE = buildCreditsAssetCandidates(CREDITS_POSTER_PATH)[0];
