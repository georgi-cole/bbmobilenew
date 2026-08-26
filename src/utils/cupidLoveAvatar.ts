import { AVATAR_ASSET_FILES } from '../data/avatarAssetManifest'

const CUPID_LOVE_ASSET_NAMES = new Set<string>(AVATAR_ASSET_FILES)

/** Stock cast portraits get their own Cupid version; personal uploads are never altered. */
export function resolveCupidLoveAvatar(avatarUrl?: string): string | undefined {
  if (!avatarUrl) return avatarUrl
  const sourcePath = avatarUrl.split(/[?#]/, 1)[0]
  const fileName = sourcePath.split('/').pop()
  if (!fileName || !CUPID_LOVE_ASSET_NAMES.has(fileName)) return avatarUrl
  const base = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '')
  return `${base}/assets/skins/cupid-love/${fileName.replace(/\.[^.]+$/, '')}_love.png`
}
