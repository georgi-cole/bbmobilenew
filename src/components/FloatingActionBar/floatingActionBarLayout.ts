export function resolveBalancedDockBottom({
  gameBottom,
  lowerBoundary,
  rosterBottom,
  dockHeight,
  minimumGap,
}: {
  gameBottom: number;
  lowerBoundary: number;
  rosterBottom: number;
  dockHeight: number;
  minimumGap: number;
}) {
  const openSpace = lowerBoundary - rosterBottom - dockHeight;
  const balancedGap = Math.max(minimumGap, openSpace / 2);
  return Math.max(minimumGap, gameBottom - lowerBoundary + balancedGap);
}
