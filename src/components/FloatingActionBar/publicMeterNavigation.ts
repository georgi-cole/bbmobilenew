export function resolvePublicMeterDestination(
  publicModeEnabled: boolean,
  publicRequestCount: number
): string {
  if (!publicModeEnabled) return '/store'
  return publicRequestCount > 0 ? '/public-meter?tab=requests' : '/public-meter'
}
