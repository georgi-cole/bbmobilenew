/**
 * Keep browser zoom available for every player. The preference controls the
 * maximum zoom range; it never disables a native accessibility gesture.
 */
export function buildViewportMetaContent(enhancedZoom: boolean): string {
  const maximumScale = enhancedZoom ? 10 : 5
  // Let the browser resize page content when its native software keyboard opens.
  // This keeps the focused game input visible without applying a browser zoom or
  // panning the entire game surface underneath the player.
  return `width=device-width, initial-scale=1.0, maximum-scale=${maximumScale}, viewport-fit=cover, interactive-widget=resizes-content`
}
