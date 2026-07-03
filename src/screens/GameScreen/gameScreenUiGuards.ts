export function shouldShowGameControlDock(
  hasStartedGame: boolean,
  blockers: readonly boolean[],
): boolean {
  return hasStartedGame && !blockers.some(Boolean);
}
