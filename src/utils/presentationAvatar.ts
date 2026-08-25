/**
 * Resolve the light, neutral presentation portrait for secondary avatar views.
 *
 * The main roster intentionally keeps its black/gold artwork.  Presentation
 * moments (mini-games and cinematic reveals) use the quieter grey-backed set
 * so portraits remain legible against dark overlays.
 */
export function resolvePresentationAvatar(source: string | null | undefined): string {
  if (!source) return source ?? ''

  const marker = 'assets/skins/'
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return source

  const assetName = source.slice(markerIndex + marker.length)
  if (assetName.startsWith('backup-grey-lux/') || !/^[^/?]+_avatar\.webp(?=[?#]|$)/i.test(assetName)) {
    return source
  }

  return `${source.slice(0, markerIndex)}${marker}backup-grey-lux/${assetName}`
}
