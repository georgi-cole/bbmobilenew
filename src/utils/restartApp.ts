export function restartApp(targetHash = '#/game'): void {
  window.location.hash = targetHash;
  window.location.reload();
}
