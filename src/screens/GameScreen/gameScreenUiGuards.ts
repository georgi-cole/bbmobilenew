export function shouldShowGameControlDock(
  hasStartedGame: boolean,
  _blockers: readonly boolean[],
  allowWhenInactive = false,
): boolean {
  // The control dock is persistent chrome for the main game screen. Gameplay
  // overlays may block interaction above it, but they must never unmount the
  // navbar and leave the player without navigation after a stale flow flag.
  return hasStartedGame || allowWhenInactive;
}
