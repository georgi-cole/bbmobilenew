export function buildViewportMetaContent(enableZoom: boolean): string {
  return enableZoom
    ? 'width=device-width, initial-scale=1.0, viewport-fit=cover'
    : 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover';
}
