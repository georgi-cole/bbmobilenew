export function shouldShowGameControlDock(
  hasStartedGame: boolean,
  blockers: readonly boolean[],
  allowWhenInactive = false,
): boolean {
  return (hasStartedGame || allowWhenInactive) && !blockers.some(Boolean);
}
