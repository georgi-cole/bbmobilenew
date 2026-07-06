export function shouldShowGameControlDock(
  hasStartedGame: boolean,
  blockers: readonly boolean[],
  forceVisible = false,
): boolean {
  if (forceVisible) return true;
  return hasStartedGame && !blockers.some(Boolean);
}
