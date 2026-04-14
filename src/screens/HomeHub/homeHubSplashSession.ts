const HOME_HUB_SPLASH_LAST_GAME_KEY = 'bb:kolequantSplashLastGameId';

export function hasSeenHomeHubSplashForGame(gameId: string): boolean {
  try {
    return localStorage.getItem(HOME_HUB_SPLASH_LAST_GAME_KEY) === gameId;
  } catch {
    return false;
  }
}

export function markHomeHubSplashSeenForGame(gameId: string): void {
  try {
    localStorage.setItem(HOME_HUB_SPLASH_LAST_GAME_KEY, gameId);
  } catch {
    // Ignore storage failures; the splash will replay next mount instead.
  }
}
