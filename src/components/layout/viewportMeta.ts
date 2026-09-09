/**
 * Keep browser zoom available for every player. The preference controls the
 * maximum zoom range; it never disables a native accessibility gesture.
 */
export function buildViewportMetaContent(enhancedZoom: boolean): string {
  const maximumScale = enhancedZoom ? 10 : 5
  // Avoid `interactive-widget`: WebKit rejects it as an unknown viewport token
  // and emits a console error that breaks the mobile browser smoke suite.
  return `width=device-width, initial-scale=1.0, maximum-scale=${maximumScale}, viewport-fit=cover`
}
