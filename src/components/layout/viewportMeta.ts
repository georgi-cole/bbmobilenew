/**
 * Keep browser zoom available for every player. The preference controls the
 * maximum zoom range; it never disables a native accessibility gesture.
 */
export function buildViewportMetaContent(enhancedZoom: boolean): string {
  const maximumScale = enhancedZoom ? 10 : 5;
  return `width=device-width, initial-scale=1.0, maximum-scale=${maximumScale}, viewport-fit=cover`;
}