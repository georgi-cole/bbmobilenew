const HOME_HUB_SPLASH_SEEN_KEY = 'bb:homeHubSplashSeen';

export function hasSeenHomeHubSplash(): boolean {
  try {
    return sessionStorage.getItem(HOME_HUB_SPLASH_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markHomeHubSplashSeen(): void {
  try {
    sessionStorage.setItem(HOME_HUB_SPLASH_SEEN_KEY, 'true');
  } catch {
    // Ignore storage failures; the splash will replay next mount instead.
  }
}
