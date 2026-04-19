const HOME_HUB_MUSIC_STARTED_KEY = 'bb:homeHubMusicStartedForGameId';

export function hasStartedHomeHubGame(gameId: string): boolean {
  try {
    return localStorage.getItem(HOME_HUB_MUSIC_STARTED_KEY) === gameId;
  } catch {
    return false;
  }
}

export function markHomeHubGameStarted(gameId: string): void {
  try {
    localStorage.setItem(HOME_HUB_MUSIC_STARTED_KEY, gameId);
  } catch {
    // Ignore storage failures; introhub music may replay on reload instead.
  }
}
