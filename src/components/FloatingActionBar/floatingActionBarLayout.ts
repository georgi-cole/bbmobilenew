export function resolveBalancedDockBottom({
  gameBottom,
  lowerBoundary,
  contentBottom,
  dockHeight,
  minimumGap,
}: {
  gameBottom: number;
  lowerBoundary: number;
  contentBottom: number;
  dockHeight: number;
  minimumGap: number;
}) {
  const openSpace = lowerBoundary - contentBottom - dockHeight;
  const balancedGap = Math.max(minimumGap, openSpace / 2);
  return Math.max(minimumGap, gameBottom - lowerBoundary + balancedGap);
}
